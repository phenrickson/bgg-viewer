# BGG Viewer — Explore Workspace — Implementation Plan

> **Flow:** implement step-by-step; **stop after each PR for review.** Branch → PR →
> `main`; **never develop on `main`; never `gh pr merge` — Phil merges PRs.** TDD where
> logic is unit-testable (SQL builders, universe/scope compile); front-end verify
> (`just check` + dev server + light/dark) for pages; **Playwright latency checks**
> against the budgets for the plot. Follows the `frontend-patterns` / `style-rules` skills.

**Spec:** [specs/2026-07-29-explore-workspace-design.md](../specs/2026-07-29-explore-workspace-design.md)

## Goal & success criteria

Rebuild `/games` Explore as a **linked plot-over-table** over a **Universe → Scope →
Brush** model, fronted by a **landing page** that warms the catalog. Success:

- Filtering the plot re-renders in **< 300ms** (from ~2.5s today); hover **< 16ms**;
  brush drag **60fps** — measured with the Playwright harness.
- The scoped set shows as a headline plot *and* a full-width table at once; brushing the
  plot narrows the table; row↔point cross-highlight.
- A **Universe** dial (Top 10,000 / All rated) frames the scope; default Top 10,000.
- A landing page orients the user and warms the catalog in the background; search and
  game detail work before the catalog is ready.

## What already exists (reuse, don't rebuild)

- **Canvas + quadtree hover** — `ScatterChart.svelte` already paints the cloud on a
  LayerChart `<Canvas>` and hit-tests hover via `tooltipContext={{ mode: 'quadtree' }}`.
- **Client catalog** — `catalog.svelte.ts` loads the Arrow artifact into DuckDB-WASM once
  and exposes `query()`; `catalog.status/count`. Artifact is **Arrow IPC** (not Parquet).
- **Scope ⇄ URL ⇄ SQL** — `scope.ts` (`toWhere`) and the rail already compile filters.
- **Overview aggregates** — `aggregates.ts` builders; **Table** view already exists.
- **Columns** — `users_rated` + `geek_rating` are in the artifact (`columns.ts`); no new
  artifact column needed for either universe.

## Affected surfaces

- `src/lib/catalog/aggregates.ts` — scatter/table SQL (drop `name`; add bounds/universe).
- `src/lib/catalog/catalog.svelte.ts` — build the `id → name` map at load; optional rank view.
- `src/lib/charts/ScatterChart.svelte` — datum carries `game_id`; `nameOf` resolver; brush.
- `src/lib/catalog/views/Overview.svelte` + `Table.svelte` — reshaped into the linked body.
- `src/routes/(app)/games/+page.svelte` — Explore shell (Universe dial, canvas body).
- `src/lib/catalog/scope.ts` — universe folds into the compiled WHERE + URL.
- `src/routes/+page.svelte` (or `(app)` landing) — new landing route.
- Tests: `aggregates.test.ts`; Playwright scratchpad scripts (latency).

## Steps

### Step 1 — Plot foundation: lazy names (DO FIRST)
**Branch:** `feat/explore-lazy-names`
- `scatterSql`/`popularitySql` return **numbers only**: `SELECT average_weight AS x,
  average_rating AS y, game_id … ` — **drop `name`**.
- Build an **`id → name` Map once** at catalog load (`catalog.svelte.ts`: one
  `SELECT game_id, name` pass after insert); expose `nameOf(id)`.
- `ScatterChart` datum carries `game_id`; the tooltip resolves the hovered name via a
  `nameOf` prop (O(1)) instead of a per-row string column. Keep Canvas + quadtree as-is.
- **Verify:** vitest — builders emit no `name`, correct columns; `nameOf` resolves; then
  Playwright filter-update latency **< 300ms** (was ~2.5s); hover still shows the name;
  `just check`; light/dark.

### Step 2 — The linked Explore canvas: plot over table + brush
**Branch:** `feat/explore-linked`
- Replace the toggled Overview/Table with the **linked body**: the headline plot
  (complexity × rating) **over** a full-width table of the same scoped set (adapt the
  existing `Table.svelte`).
- **Brush** on the plot → x/y bounds. *Spike first:* confirm LayerChart brush support; if
  absent, a Canvas overlay rect driven by pointer + a bounds filter. The brush filters the
  table (bounds pushed into the table query, or an in-memory typed-array filter) and drives
  **selection styling** (brushed-in solid vs. dimmed-out) + **row↔point cross-highlight**.
  One-click **clear brush**; the rail scope is untouched by the brush.
- Relocate the **aggregate charts** (rating histogram, games-per-year, top categories) into
  a collapsible **Set summary** secondary lens (they can't just vanish). *(Split into a 2b
  PR if this one gets large.)*
- **Verify:** brushing narrows the table; cross-highlight both ways; clear works; brush
  interaction 60fps / table update < 100ms; `just check`; light/dark; a real slice looks right.

### Step 3 — Universe dial (Top 10,000 / All rated)
**Branch:** `feat/explore-universe`
- Universe control at the **top of the rail**; default **Top 10,000**.
- Compile to a WHERE prefix folded into `toWhere`: **All rated** = `users_rated >= 30`;
  **Top 10,000** = a `geek_rating` rank ≤ 10000 (a one-time DuckDB rank view at load —
  `ROW_NUMBER() OVER (ORDER BY geek_rating DESC)` — or an equivalent threshold). Carried in
  the **URL**.
- **Density-by-N:** plot `r`/`opacity` derive from the live count (Top-10k crisper).
- **Verify:** switching universe changes the set + redraws; unfiltered Top-10k = 10,000
  rows; URL round-trips + reload restores; latency budget held; light/dark.

### Step 4 — Landing page + catalog warm-up
**Branch:** `feat/landing`
- New landing route: game **search** (→ detail point lookup, works pre-catalog),
  **example-query chips** (deep-link into a pre-scoped `/games`), entry cards
  (Explore ready; Predictions/Similarity/Collection soon). **Placeholder copy — Phil writes
  the final strings.**
- Kick `initCatalog()` + a priming query in the **background** on mount; a warming indicator.
- **Verify:** landing renders; search→detail works before catalog `ready`; chips land in a
  scoped Explore; catalog warm by the time Explore opens; `just check`; light/dark.

*(Step 4 is route-independent of 1–3 and can be built in parallel if useful.)*

## Risks / unknowns / rollback

- **LayerChart brush support is the key unknown** (Step 2) — spike it before committing the
  interaction; the Canvas-overlay fallback is the rollback if the primitive is missing.
- **Two-level filtering clarity** — rail-scope vs. brush must read as distinct or it confuses;
  design the brush to feel ephemeral (clear affordance, no URL write).
- **Top-10k definition** — deriving rank from `geek_rating` ≈ but isn't exactly BGG's published
  rank; add a real `bgg_rank` artifact column later only if exactness matters.
- **One plot may be thin** (spec open question) — Step 2 leaves the axis swappable / a second
  plot cheap to add; not a one-way door.
- Each step is an independent PR and revertable; nothing here is irreversible.

## Out of scope

- Entity profile pages (designer/artist/publisher) — their own slice.
- Predictions / similarity / collection modules — their own rooms.
- Save view / shareable saved queries; kitchen-sink (140k).
- Deploy/IAM (the SK server's BigQuery grant) — a later, Actions-only slice.
