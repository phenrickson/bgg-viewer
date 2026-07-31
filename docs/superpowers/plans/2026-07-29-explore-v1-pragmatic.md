# BGG Viewer — Explore v1 (radical pragmatism) — Implementation Plan

> **Supersedes** [2026-07-29-explore-workspace-implementation.md](2026-07-29-explore-workspace-implementation.md)
> for near-term delivery. Same spec ([2026-07-29-explore-workspace-design.md](../specs/2026-07-29-explore-workspace-design.md))
> and mockup ([explore-workspace-mockup.html](../../design/explore-workspace-mockup.html)),
> re-sequenced around a **radically pragmatic goal: a working end-to-end loop —
> landing → Explore → game profile — built on in-browser filtering, cutting the
> bespoke/hard pieces.**
>
> **Flow:** branch → PR per step; **stop after each PR for review.** Never develop on
> `main`; **never `gh pr merge` — Phil merges.** `just check` + `just dev`
> (localhost:5173) + light/dark for every UI step. Follows the `frontend-patterns` /
> `style-rules` skills. **Phil writes all user-facing copy — placeholders only.**

## The architecture in one line

The catalog is a **local database in the browser tab.** The Arrow artifact loads into
**DuckDB-WASM once**; after that **every filter, aggregate chart, facet count, and
type-ahead lookup is a local SQL query** compiled from `scope` → `where` — no server, no
network per interaction. The server does exactly two things, neither in the filter loop:
serves the artifact once (gzipped, ETag-cached) and does the **game-detail point lookup**
(`/games/[id]` → warehouse `game_profile`; the full doc isn't in the catalog).

## Decisions baked in (this session, 2026-07-29)

1. **Expand the catalog artifact first — it's the substrate.** Add best/recommended
   player-count arrays + designers/artists/publishers (families already in); drop the
   duplicate `complexity`. Size impact measured over the 35,195-row working set:
   ~3.8 MB uncompressed / **~1–1.3 MB added to the gzipped download** on a ~30 MB base —
   trivial.
2. **Recommended/best player-count search is the flagship** — the thing BGG *cannot*
   do, and nearly free (~50 KB gzipped). Sourced from `analytics.best_player_counts` (the
   derived simple numbers), not the raw votes (those stay on the profile).
3. **No scatter plot in v1.** Cut. It was the most bespoke, riskiest piece (custom canvas,
   quadtree hover, the `< 300ms` latency worry). The set's *shape* is delivered by plain
   **LayerChart aggregate charts** instead. `ScatterCanvas`/`CloudCanvas`/`HeadlinePlot`/
   `ScatterChart` become dead code, removed in cleanup.
4. **Aggregates are promoted to first-class** (a departure from the mockup, which hid them
   behind a lens). Explore is one scrollable page: KPIs → aggregate chart grid → table.
   No Explore/Summary lens toggle.
5. **High-cardinality search = in-browser type-ahead.** Designers/artists/publishers get a
   combobox that queries `SELECT DISTINCT UNNEST(col) … ILIKE '%q%'` over the in-memory
   catalog. Beats the `filter_designers`/`filter_publishers` caps, needs no server, and
   dissolves the publisher-noise problem (you type the one you want).
6. **No brush** (was the mockup's headline interaction — moot now the scatter is gone).

## Goal & success criteria

- **Catalog artifact** carries best/recommended player-count arrays + designers/artists/
  publishers (families already present); duplicate `complexity` dropped. Builds
  deterministically (stable ETag), loads into DuckDB-WASM; gzipped download grows ~1 MB.
- **Explore `/games`** type-checks and is a coherent in-browser workspace: Universe dial +
  two-tier rail (direct low-cardinality facets + type-ahead high-cardinality search,
  **including best/recommended-at-N**); a scope-summary header (live count); KPIs + a
  LayerChart aggregate grid + the sortable/paged table — all recomputed locally on scope
  change.
- **Landing `/`** orients + warms the catalog; search → detail works before catalog ready.
- **Profile `/games/[id]`** gains publisher + best/recommended-count display.
- `just check` clean; light + dark verified each step.

### Measured size deltas (working set = 35,195 rows)

| Field | Added uncompressed | Est. gzipped |
|---|---:|---:|
| best + recommended player counts (int arrays) | ~0.3 MB | ~50 KB |
| designers | ~0.97 MB | ~0.3 MB |
| artists | ~0.97 MB | ~0.3 MB |
| publishers | ~1.75 MB | ~0.4 MB |
| families | already present — 0 | 0 |

## Affected surfaces

- `src/lib/server/catalog/columns.ts` — artifact shape; add entity + player-count columns; drop `complexity`.
- `src/lib/server/catalog/build.ts` — `LEFT JOIN analytics.best_player_counts`; `SPLIT`→`ARRAY<INT64>`.
- `src/lib/server/catalog/serialize.ts` — extend the Arrow schema (list<utf8> entities + list<int> player counts).
- `src/lib/catalog/scope.ts` — filters for player-counts + high-cardinality chips + URL round-trip.
- `src/lib/catalog/Rail.svelte` — two-tier rail (Universe dial + direct facets + type-ahead comboboxes).
- `src/lib/catalog/aggregates.ts` — the GROUP BY builders behind the chart grid.
- `src/routes/(app)/games/+page.svelte` — Explore shell: header, KPI row, chart grid, table.
- `src/lib/catalog/views/` — new KPI + chart-grid components; retire `HeadlinePlot`/`SetSummary` scatter bits.
- `src/routes/(app)/+page.svelte` — landing page.
- `src/routes/(app)/games/[id]/+page.svelte` — add publishers + best/recommended counts.
- Tests: `columns.test.ts`, `serialize.test.ts`, `scope.test.ts`, `aggregates.test.ts`.

## Steps

### Step 0 — Unbreak the tree ✅ (done, uncommitted)
**Branch:** `feat/explore-lazy-names`
- `Rail.svelte` `ratedOnly` checkbox → functional Universe toggle; `scope.test.ts`
  rewritten to the `universe` model. `just check` green; scope tests pass.

### Step 1 — Expand the catalog artifact (data foundation, DO FIRST)
**Branch:** `feat/catalog-fields`
- `columns.ts`: add list columns `designers`, `artists`, `publishers`; add `INT`-array
  player-count columns `best_player_counts`, `recommended_player_counts`; drop `complexity`.
- `build.ts`: `LEFT JOIN analytics.best_player_counts` on `game_id`; comma-strings →
  `ARRAY<INT64>` (`SPLIT` + `SAFE_CAST`, `[]` when null). Keep `ORDER BY game_id`.
- `serialize.ts`: extend the Arrow schema for the new columns.
- **Verify:** `columns.test.ts` / `serialize.test.ts` green; build locally, confirm ~1 MB
  gzipped growth and DuckDB load; smoke query answers *"best at 2"* / *"recommended at 6"*;
  ETag stable across two identical builds; `just check`.

### Step 2 — The two-tier rail (in-browser facets + type-ahead)
**Branch:** `feat/explore-rail`
- Universe dial (done in Step 0, restyle to mockup) at top.
- **Direct facets (low-cardinality):** search (name), Year/Complexity/Geek (number inputs;
  sliders deferred), Players **with best/recommended-at-N toggle** (new arrays),
  Categories & Mechanics checkbox lists with live counts.
- **Type-ahead (high-cardinality):** Designer / Artist / Publisher comboboxes querying
  `SELECT DISTINCT UNNEST(col) d … WHERE d ILIKE '%q%' LIMIT 20` over the catalog;
  selection → filter chip (`list_contains(col, 'X')`), OR within an entity.
- `scope.ts`: compile the new filters + URL round-trip; extend `scope.test.ts`.
- **Verify:** `just check`; "best at 2" and a designer pick narrow the set correctly;
  Universe toggle round-trips in the URL; unfiltered Top-10k total = 10,000; light/dark.

### Step 3 — The canvas: KPIs + aggregate chart grid + table
**Branch:** `feat/explore-canvas`
- Scope-summary header: live count + summary line (one owner for the count).
- **KPI row** (`Card.Kpi` in `AutoGrid`): count · median rating · median complexity · year span.
- **Aggregate chart grid** (`AutoGrid` of `.chart-area` LayerChart cards): rating dist,
  complexity dist, games/year, top categories, top mechanics, **best-at player count** —
  all `GROUP BY` over the current `where`, recomputed locally on scope change.
- The sortable/paged `Table.svelte` (DuckDB-paged) below, full width.
- **Verify:** header count matches table total; charts update on every scope change and
  feel instant; `just check`; light/dark; a real slice reads right.

### Step 4 — Landing page + catalog warm-up
**Branch:** `feat/landing`
- Replace `(app)/+page.svelte` with the mockup landing: hero, big search (→ detail point
  lookup, pre-catalog), query chips deep-linking into a pre-scoped `/games` (incl. a
  player-count chip; verify each `scopeToParams` URL round-trips), entry cards, warming
  indicator. Kick `initCatalog()` + a priming query in the background on mount.
- **Verify:** search → detail before catalog `ready`; chips land in the right scope;
  catalog warm on Explore open; `just check`; light/dark.

### Step 5 — Profile enrichment + cleanup + whole-loop verify
**Branch:** `feat/explore-cleanup`
- Add publishers + best/recommended player counts to `/games/[id]` (data already in the
  `game_profile` document — no artifact dependency).
- **Delete the scatter stack** (`ScatterCanvas`, `CloudCanvas`, `HeadlinePlot`,
  `ScatterChart`) and any dead Overview remnants; confirm nav/crumbs connect the loop.
- **Verify:** click landing → chip → Explore → row → profile → back; `just check`; unit
  tests green; light/dark.

## Risks / unknowns / rollback

- **Stacked branches.** `feat/explore-lazy-names` sits on the still-open PR #9 — confirm
  merge order with Phil. Each step is an independent PR and revertable.
- **`best_player_counts` (analytics, home-box-scrape sourced)** — a game with no votes
  gets empty arrays (filters just exclude it); the build now depends on that table.
- **Type-ahead perf at "All rated"** — `DISTINCT UNNEST` over the long tail should still be
  ms-scale in DuckDB; if a keystroke ever lags, debounce + `LIMIT`. Not expected to bite.
- **ETag churn** — adding columns changes the content hash once (expected); keep the build
  deterministic so it doesn't churn per rebuild.
- Nothing here is irreversible — no BigQuery schema change (we read existing tables), no
  deploy/IAM change. The scatter cut is pure deletion.

## Out of scope (v1)

- **Scatter plot / brush / cross-highlight** — cut; revisit only if the aggregate charts
  prove too thin.
- **Dual-thumb range sliders** (number inputs stand in).
- **Entity facet *lists*** in the rail (type-ahead covers search; a ranked designer/
  publisher facet + "primary publisher" model is a later question).
- **Playtime filter** — trivial scalars to add later for the "under 45 min" chip.
- Save view / shareable saved queries; entity profile pages; Predictions / Similarity /
  Collection rooms; kitchen-sink (140k); deploy/IAM.
