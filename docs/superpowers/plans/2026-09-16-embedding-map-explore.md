# Embedding map — explore v1 implementation plan

Spec: `docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md`

## Goal

A dev-gated `/dev/map` page that plots the catalog working set (~36k games) in PCA
(default, any PC*n*×PC*m* pair from the first six) or UMAP, coloured/sized by catalog facts,
with hover/select/search and a hand-curated anchor list — fed by a new lazy
`/api/coordinates` artifact built the way `/api/thumbnails` is.

**Success:** `pnpm dev` → `/dev/map` renders every working-set game with coordinates in
under ~2s after the catalog is warm; switching projection/axes/colour is instant and
URL-synced; hover/tap identifies a game and click opens its detail; the footer shows
plotted/missing counts and the model version; `pnpm test` and `pnpm check` pass; Phil has
used it and picked at least one anchor.

## Affected surfaces (bgg-viewer unless noted)

- **new** `src/lib/server/coordinates/{columns,serialize,build,cache}.ts` + tests — mirrors
  `src/lib/server/thumbnails/`
- **new** `src/routes/api/coordinates/+server.ts` — mirrors `api/thumbnails`
- **new** `src/lib/map/{coordinates,scales,quadtree,anchors,view}.ts` + tests
- **new** `src/lib/map/EmbeddingMap.svelte`
- **new** `src/routes/(app)/dev/map/{+page.server.ts,+page.svelte}` + a small controls
  component and detail panel
- `package.json` — add `d3-quadtree` (+ `@types/d3-quadtree`)
- `.gitignore` already covers `.cache/`; new disk mirror `.cache/coordinates.arrow.gz`
- **bgg-predictive-models (separate PR):** `scripts/pca_loadings.py` + a markdown note

No warehouse changes. No changes to the catalog artifact or `catalog.svelte.ts`'s init path.

## Reuse

- `createArtifactCache` (`server/artifact-cache.ts`) — build-once-per-TTL, disk mirror,
  offline behaviour, all free.
- `WORKING_SET_WHERE` from `server/catalog/columns.ts` — guarantees the artifact's row set
  is the catalog's.
- `num()` INT64-unwrapping and the `Table`/`vectorFromArray`/`tableToIPC` pattern from
  `thumbnails/serialize.ts`.
- `fetchThumbnailMap` (`lib/catalog/thumbnails.ts`) as the model for a DuckDB-free
  `apache-arrow` reader.
- `catalog.query()` for the metadata join and the name search (`name ILIKE`), so no new
  search component.
- `d3-scale` (already present) for the colour ramps and zoom transform; chart tokens
  `--chart-1..8` and the `oklch` ramp endpoints from `app.css`.

## Steps

### Phase 0 — set up

**0.1** Branch `feat/embedding-map` off `main` (`gh pr view` on push to confirm nothing is
merged out from under it).

**0.2** Load `frontend-patterns` and `style-rules` skills before writing any Svelte or CSS.
Load `dataviz` before writing the canvas renderer.

**0.3** `pnpm add d3-quadtree && pnpm add -D @types/d3-quadtree`.

*Verify:* `pnpm check` still clean.

### Phase 1 — the artifact (server)

**1.1 `columns.ts`** — `K_COMPONENTS = 6` and `coordinatesQuerySql(featuresTable,
embeddingsTable, coordinatesTable)`:

```sql
SELECT f.game_id,
       e.embedding[OFFSET(0)] AS pc_1, … e.embedding[OFFSET(5)] AS pc_6,
       c.umap_1, c.umap_2,
       e.embedding_version, e.embedding_model
FROM `…analytics.games_features` f
JOIN `…predictions.bgg_game_embeddings` e USING (game_id)
JOIN `…predictions.bgg_game_coordinates` c USING (game_id)
WHERE <WORKING_SET_WHERE> AND e.embedding_version = c.embedding_version
ORDER BY f.game_id
```

Test (like `thumbnails/columns.test.ts`): no `SELECT *`, contains `users_rated >= 30`,
contains `pc_6` and not `pc_7`, joins on version.

*Verify:* `bq query --dry-run` of the emitted SQL (paste from a one-off `node -e`) — expect
a few hundred MB scanned at most (the `embedding` column dominates); then the real query
returns ≈ 35.9k rows, exactly one distinct `(embedding_version, embedding_model)`.

**1.2 `serialize.ts`** — `CoordinateRow` type; `rowsToArrowIPC(rows)` producing `game_id`
Int32, `pc_1..pc_6`, `umap_1`, `umap_2` Float32, and schema metadata
`{ embedding_version, embedding_model, k: "6" }`. Throws if rows carry more than one
distinct version/model — the loud failure the spec asks for. Test: round-trip two fake rows
through `tableFromIPC`, assert dtypes, metadata, and that a mixed-version input throws.

**1.3 `build.ts`** — `fetchCoordinates(client)` and `buildCoordinatesArtifact()`; table names
from `GCP_PROJECT_ID` like `thumbnails/build.ts`.

**1.4 `cache.ts`** — `createArtifactCache({ cachePath: '.cache/coordinates.arrow.gz', ttlMs:
24h, label: 'coordinates' })`; `getCoordinatesArtifact()` + `_resetCoordinatesCache()`.
Test mirrors `thumbnails`'s cache test if one exists, else a minimal builder-injected one.

**1.5 `api/coordinates/+server.ts`** — copy of the thumbnails handler: 401 without
`locals.user`, ETag/304, gzip, `private, max-age=86400`.

*Verify:* `pnpm test`; `just dev` then `curl -sI -b <session> localhost:5173/api/coordinates`
→ 200, `content-encoding: gzip`, size ≈ 1.1 MB; second request with `If-None-Match` → 304.

### Phase 2 — client data layer (`src/lib/map/`)

**2.1 `coordinates.ts`** — `fetchCoordinates(): Promise<CoordinateSet>` where
`CoordinateSet = { ids: Int32Array; pcs: Float32Array[] /* k columns */; umap: [Float32Array,
Float32Array]; version: number; model: string; k: number }`. Reads Arrow columns straight
into typed arrays (no per-row objects — 36k × 8 boxed numbers is avoidable GC churn).
Test: build a tiny IPC buffer with `serialize.ts` and read it back.

**2.2 `facts.ts`** — one `catalog.query()` returning, for the working set:
`game_id, name, year_published, average_weight, users_rated, upcoming, categories[1] AS
top_category`, keyed by `game_id` into parallel typed arrays aligned to the coordinate
set's `ids` (index map built once). Games in the catalog but not the artifact are counted as
`missing` for the footer. Test: alignment against a synthetic catalog result.

**2.3 `view.ts`** — the URL-synced view state: `{ projection: 'pca'|'umap', x: 1..k, y: 1..k,
colour: 'weight'|'year'|'upcoming'|'category', upcoming: boolean, minRatings: number,
selected?: number }` with `toParams()`/`fromParams()` and defaults (PCA, PC1×PC2, weight,
upcoming on, minRatings = 30). Test: round-trip and defaulting of bad values.

**2.4 `scales.ts`** — radius from `log1p(users_rated)` clamped to `[1.5, 9]` px (upcoming
fixed 2.5 px); colour scales: weight ramp (1–5), year ramp (1990–now, clamped), upcoming
two-state, category → `--chart-1..8` + `--muted-foreground` for "other". Tokens are read
once from `getComputedStyle(document.documentElement)` so dark mode follows. Tests on the
pure numeric parts.

**2.5 `quadtree.ts`** — `buildIndex(xs, ys)` → `d3-quadtree`; `nearest(index, x, y, r)`.
Test: nearest returns the right id on a small grid.

### Phase 3 — `EmbeddingMap.svelte` (canvas)

Props: `coords: CoordinateSet`, `facts`, `view: ViewState`, `anchors: number[]`,
`selected?: number`. Events: `onselect(id)`, `onhover(id | null)`.

- Derives `xs`/`ys` for the current projection/axes, a `d3-scale` linear domain from data
  extent (padded 5%), and a zoom transform (`k`, `tx`, `ty`) held in component state.
- Draws in `requestAnimationFrame`, coalescing state changes: background, points (filtered
  by `minRatings` and the upcoming toggle; alpha 0.6 for established, hollow stroke for
  upcoming), then anchors with labels, then the selected ring + label. Uses
  `devicePixelRatio` for crispness; `ResizeObserver` for width.
- Pointer: `pointermove` → quadtree nearest within 8 px (in screen space, so search radius
  scales with zoom) → `onhover`; `click`/`tap` → `onselect`; wheel/pinch → zoom about the
  cursor; drag → pan; double-click → reset. Touch: no hover path, tap selects.
- Tooltip is a positioned `<div>` driven by the hover id, not drawn on canvas (so it can
  use real text styling and wrap).
- No knowledge of routes, catalog or URL.

*Verify:* a Storybook-less smoke: mount in `/dev/map` with real data and eyeball; `pnpm
check` types; unit tests only on the pure helpers (Phase 2). Drawing correctness is a
visual check by Phil — no browser automation.

### Phase 4 — `/dev/map` page

**4.1 `+page.server.ts`** — `if (!dev) error(404)`, as `dev/vizzes`.

**4.2 `+page.svelte`** — `initCatalog()` then `fetchCoordinates()` + `facts` in parallel;
loading/empty states (`catalog.status`, artifact fetch failure → visible error, not a blank
canvas). Controls strip (projection, axes selects shown only for PCA, colour, upcoming
toggle, min-ratings range), the map, detail panel (name, year, weight, ratings, link to
`/games/[id]`; "not yet placed" if the searched game has no coordinates), search input →
`catalog.query('… WHERE name ILIKE …LIMIT 8')` → select + centre. View state ⇄ URL via
`replaceState` (not `goto`) so history isn't spammed. Footer line with counts + model.
All strings placeholder and marked `PLACEHOLDER` in a comment.

**4.3 `anchors.ts`** — `export const ANCHORS: number[] = []` with a comment on what it is
for. Phil fills it.

*Verify:* `pnpm check`, `pnpm test`; manual: load page, switch every control, reload with
the URL and get the same view, search "Brass", select, open detail, toggle dark mode.

### Phase 5 — iterate, then PR

Phil explores locally, picks anchors, reports what's ugly or slow. Fix in the loop. When it
has converged: `pnpm test && pnpm check`, commit in logical steps (artifact / data layer /
map / page), open the PR against `main`, hand off. **Do not merge.**

### Side track — PCA loadings (bgg-predictive-models)

Branch `chore/pca-loadings`; `scripts/pca_loadings.py`: load
`prod/models/registered/embeddings/embeddings-v2026/v6/pipeline.pkl` from GCS via the
existing `RegisteredEmbeddingsModel` loader, take the final PCA step's `components_` and the
fitted feature names from the preprocessing step, print top ±10 features for PC1–PC8 with
explained variance. Save the output as
`docs/superpowers/specs/2026-09-16-embedding-map-pca-loadings.md` in bgg-viewer (next to
the spec) so the naming discussion has the numbers. Own PR. Not a blocker for Phases 1–4.

## Risks / unknowns / rollback

- **BigQuery cost of the build query.** It touches the 64-float `embedding` column for the
  full embeddings table before the join prunes rows — dry-run first (Step 1.1). If it's
  more than a few hundred MB, select `embedding_8` instead (pre-truncated, same first 6
  values) — that is the likely cheaper column and the plan should just start there if the
  dry-run says so.
- **Version skew.** Embeddings and coordinates are written by different daily jobs; on the
  day of a model bump they can disagree for hours. The join on `embedding_version` plus the
  serializer's single-version assertion means the build fails (and the cache serves the
  previous artifact) rather than mixing spaces. Watch for a log line, not a broken page.
- **Artifact size / first-open latency.** ~1.1 MB gz after a 5.25 MB catalog. If it grates,
  quantise to int16 in `serialize.ts` + `coordinates.ts` — contained change, noted in spec.
- **Canvas performance on phones.** 36k points with alpha at DPR 3 may drop frames during
  pan. Mitigations in order: draw at DPR ≤ 2, skip alpha under a `minRatings` threshold,
  pre-render established points to an offscreen canvas and only redraw overlays per frame.
  v1 accepts "works, not silky" on mobile.
- **Rollback:** everything is additive and dev-gated; reverting the PR removes it. The
  `.cache/coordinates.arrow.gz` mirror is gitignored.
- **One-way doors:** none. No schema, no warehouse, no catalog artifact change.

## Out of scope

Neighbours, brush → set, tour, game-detail mini-map, landing teaser, density contours,
loadings in the UI, the public route, and any change to which games the embedding
pipeline scores — all per the spec's *Not doing*.
