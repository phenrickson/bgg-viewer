# Embedding map — explore v1 design

**Date:** 2026-09-16
**Status:** Design agreed, ready to plan

## Problem

bgg-viewer has no way to see the whole landscape of board games at once. The game
embeddings that drive "Similar games" are a 64-dimensional PCA of every game's structural
features (mechanics, categories, families, player counts, numerics, predicted complexity),
and the warehouse already carries a 2-D UMAP of that space. Nobody can look at either.

The eventual feature is three jobs on one map: the **landscape** at a glance, an
**explanation** of embeddings as a way to see data (a guided tour), and **placement** —
find a game, see its neighbours, see where an upcoming game lands. This spec is only the
first step: a free-exploration map Phil can use to learn what the space actually looks like
with the model we have, pick anchor games, and decide what the tour should say. The tour,
neighbours and the brush→set handoff are deliberately deferred (see *Not doing*).

## What we know about the data

Verified against the warehouse on 2026-09-15:

- Production model is `embeddings-v2026` v6: PCA, 64 components, 374 input features,
  79.3% explained variance. Every game in `predictions.bgg_game_embeddings` carries the
  full 64-float `embedding` plus a pre-truncated `embedding_8`.
- `pca_1`/`pca_2` in `predictions.bgg_game_coordinates` are exactly `embedding[0]` and
  `embedding[1]` (r = 1.000). **"More PCA components" needs no new model or pipeline** —
  ship the first *k* dims of the vector.
- **PC1 is complexity** (r = 0.75 with `average_weight`); PC2 is orthogonal to weight
  (r = 0.00) and not yet named. UMAP's second axis also tracks weight (r = −0.59).
- Catalog working set (`users_rated >= 30 OR year_published >= current year`) is ~36.1k
  games: 30,974 established + 5,142 upcoming. ~244 of them have no coordinates because
  BGG gives them `yearpublished = 0` (Go Fish, War, Crazy Eights, Unpublished
  Prototype…) and the embedding service skips null-year games. That is upstream policy,
  not a viewer concern; the map shows the count and omits them. (21 BC-dated games — Go,
  Senet, Nine Men's Morris — were wrongly nulled by a warehouse parse bug, fixed in
  bgg-data-warehouse #119/#120; they will gain coordinates on the next embedding run.)

## Design

### Delivery: a separate, lazy coordinates artifact

Clone the thumbnails pattern (`src/lib/server/thumbnails/*`, `/api/thumbnails`,
`src/lib/catalog/thumbnails.ts`): a small Arrow IPC artifact built in-process from
BigQuery, cached with the shared `artifact-cache` factory, served gzipped behind the auth
gate with an ETag, and fetched by the browser only when the map page opens.

**Not** folded into the catalog artifact. Floats gzip poorly, so ~8 floats × 36k games is
~1 MB on the wire — a 15–20% tax on the 5.25 MB catalog every user downloads, for a page
most sessions never open. A lazy artifact costs nothing to anyone who doesn't open the map.

Schema, one row per working-set game that has coordinates:

| column | type | source |
|---|---|---|
| `game_id` | int32 | |
| `pc_1 … pc_k` | float32 | `predictions.bgg_game_embeddings.embedding[0..k-1]` |
| `umap_1`, `umap_2` | float32 | `predictions.bgg_game_coordinates` |

**k = 6** to start; a single constant in the build. Raise it once PC3–PC6 have been looked
at and found to say something. The artifact also carries `embedding_version` and
`embedding_model` as Arrow schema metadata (not per-row columns) so the page can display
which model it is looking at and refuse to mix versions if the two source tables ever
disagree — the build joins on `embedding_version` and fails loudly if the max versions
differ.

Row set = the catalog's working-set predicate (reuse `WORKING_SET_WHERE` from
`catalog/columns.ts`) joined to both prediction tables, so every plotted game also exists
in the catalog. Game facts (name, weight, year, users_rated, upcoming flag, categories)
come from the catalog already in the browser — one source of truth for metadata, same rule
the similar-explorer bench follows. The artifact holds coordinates only.

Size budget: 8 float32 + int32 per row ≈ 1.3 MB raw, ~1.1 MB gzipped. Acceptable for a
lazy load; if it grates, quantise coordinates to int16 (halves it, invisible at plot
resolution) — noted, not done in v1.

### Page: `/dev/map`

Gated like `/dev/vizzes` (`if (!dev) error(404)`) — the artifact endpoint is auth-gated
regardless. Promotion to a public route is a one-line change and a separate decision.

Layout: the map fills the viewport width; a control strip above it; a detail panel that
appears on selection (right on desktop, bottom sheet on phone). No sidebar — the map *is*
the page.

**Controls (all URL-synced so a view can be shared and reopened):**

- **Projection:** `PCA` (default) | `UMAP`.
- **Axes** (PCA only): X = PC*n*, Y = PC*m*, each a select over 1..k. Default X = PC1,
  Y = PC2. This is the exploration instrument — it is how Phil finds out whether PC3+ are
  nameable or noise.
- **Colour by:** `weight` (default, continuous ramp) | `year` (continuous) | `upcoming`
  (two-state) | `top category` (categorical, capped at the 8 chart tokens + "other").
- **Show upcoming:** on by default. Upcoming games draw as hollow rings so "where do this
  year's releases fall" is one toggle.
- **Min ratings** slider (log scale, default = working-set floor). Lets the long tail be
  thinned to see structure without changing the artifact.

**Marks:**

- Point size = log(users_rated + 1), clamped. Popular games become hubs; the long tail
  becomes texture. Upcoming games (few ratings) get a fixed small radius.
- Anchor games draw on top with a label. Anchors are a hand-curated list of game ids in
  `src/lib/map/anchors.ts` — empty in v1, filled by Phil as he explores. Labels are the
  game name from the catalog; no editorial copy in v1.
- Selected game: ring + label; its row in the detail panel.

**Interaction:**

- Hover (pointer) → tooltip: name, year, weight, users_rated. Tap (touch) → select.
- Click → select; detail panel shows the catalog row and a link to `/games/[id]`.
- Search box (reuses the catalog's existing name search) → selects and centres on a game.
- Pan/zoom: wheel/pinch zoom, drag pan, double-click reset. Zoom is a transform on the
  canvas, not a data reload.
- Footer line: "*N* games plotted · *M* without coordinates · model *name* v*version*".
  Copy is placeholder and flagged; Phil writes it.

**Rendering:** 36k points is past what SVG (the existing `charts/Scatter.svelte`) holds up
under pan/zoom, so this is a `<canvas>` 2-D renderer with a `d3-quadtree` for hit-testing
(add `d3-quadtree`; `d3-scale`/`d3-array` are already present). No WebGL — not needed at
this scale, and it would add a dependency and a second rendering path. Colour ramps and
categorical palettes use the chart tokens from `app.css`, never raw hex (style-rules). The
canvas is redrawn on the animation frame after any state change, not per event. Dark mode
follows the tokens.

At the overview zoom the party-game corner will be an opaque smear. v1 answers that with
the min-ratings slider and point alpha, not density contours — contours are a v1.5
question once the shape is known.

**Mobile:** must work but is not the design target for v1 — tap-select, pinch-zoom, bottom
sheet. Hover-only affordances (tooltip) have tap equivalents.

### Component shape

```
src/lib/server/coordinates/        build.ts · cache.ts · columns.ts · serialize.ts   (mirrors thumbnails/)
src/routes/api/coordinates/+server.ts
src/lib/map/                       coordinates.ts (client reader) · anchors.ts · scales.ts · quadtree.ts
src/lib/map/EmbeddingMap.svelte    the canvas + interaction; props: rows, projection, axes, colourBy, …
src/routes/(app)/dev/map/          +page.server.ts (dev gate) · +page.svelte (controls + panel)
```

`EmbeddingMap.svelte` takes plain data + a view state and emits `select`/`hover`. It knows
nothing about routes or the catalog — that is what lets the same component later drive the
tour (state sequence), the game-detail mini-map (fixed selection, no controls), and a
landing teaser (static state).

## Supporting analysis (predictive-models, not viewer)

A one-off script in bgg-predictive-models that loads the registered `pipeline.pkl` for
`embeddings-v2026` v6, pulls the PCA component loadings, and prints the top ±10 input
features per component for PC1–PC8. This is how PC2..PC6 get names — from the loadings,
not from squinting at the scatter. Output goes in a markdown note next to this spec once
run. Separate small PR in that repo; not a blocker for the map.

## Delivery

Branch `feat/embedding-map` off `main` in bgg-viewer; one PR, Phil merges. The loadings
script is its own branch/PR in bgg-predictive-models. No warehouse changes.

## Copy

All user-facing strings are placeholder and flagged. Phil writes the copy, including the
eventual tour.

## Not doing (v1)

- **Neighbours on click.** Must come from the 64-d space (warehouse `game_neighbors`),
  not 2-D proximity — 2-D neighbours would be wrong and would teach the wrong lesson.
  Needs the neighbour endpoint the game page uses; v1.5.
- **Brush → set of games** handed to `/games`. The set-thesis payoff and the power-user
  feature; needs a selection model shared with the query view. Later.
- **Guided tour / scrollytelling.** Same component driven by a state sequence; written
  after Phil has explored and chosen anchors and copy.
- **Game-detail mini-map** and **landing teaser.** Promotion-time uses of the component.
- **Density contours / hexbin** at overview zoom.
- **Loadings in the UI** (top features for the selected axes). Wait for the numbers.
- **Public route.** Stays behind the `dev` gate until the above is decided.
- **Embedding null-year games** upstream. Pipeline policy, Phil's call, separate repo.

## Open

- Whether k = 6 is enough or PC7+ carry anything — answered by the loadings script and
  by looking.
- Whether float32 → int16 quantisation is worth doing before promotion.
- Exact behaviour when the catalog has a game the artifact lacks (new game since the
  last embedding run): currently omitted and counted; a "not yet placed" note in the
  detail panel if searched for is cheap and probably right.
