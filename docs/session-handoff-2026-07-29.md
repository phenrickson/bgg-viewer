# Session handoff — 2026-07-29

Picks up the client-catalog front-end (Explore over the BGG warehouse). Continues
the work in [the client-catalog spec](superpowers/specs/2026-07-28-client-catalog-architecture-design.md)
and [plan](superpowers/plans/2026-07-28-client-catalog-implementation.md).

## Where things stand

**Branch `feat/explore-views` → PR #9 (open, unmerged — the user merges PRs).**
Steps 1–3 of the plan are on `main`. Step 4 (Explore views) lives on this branch.

Working and verified locally:
- **`/games` Explore page** — filter rail (URL-synced scope) + a view switcher.
- **Overview view** — 4 stat tiles + LayerChart panels: complexity-vs-rating and
  rating-vs-popularity **scatters** (Canvas, full ~30k cloud), rating distribution
  + games-per-year **bars**, top-categories **row bars**. All aggregation runs in
  the in-browser DuckDB (`src/lib/catalog/aggregates.ts`). Every chart is
  interactive (hover tooltips via LayerChart `Tooltip` + `Highlight`).
- **Table view** — DuckDB-`ORDER BY` sorting over the whole filtered set (default
  Geek rating desc), OFFSET pagination (Prev/Next/First/Last).
- **View switch is keep-alive** — both views stay mounted (hidden, not destroyed),
  so switching preserves state and doesn't re-query.
- **Working set = users_rated ≥ 30 ∪ upcoming** (raised from 25 this session).

`just check` clean, 42 vitest tests pass.

## How to run / verify locally

- `just dev` → http://localhost:5173/games (dev-auth bypass is on; no login needed).
- `just check` (svelte-check) and `pnpm vitest run` before every commit.
- Browser verification uses **Playwright (Python)** from the warehouse venv:
  `C:/Users/philh/projects/bgg-data-warehouse/.venv/Scripts/python.exe`. Set
  `PYTHONUTF8=1` when printing chart glyphs (≥, ·). Scratchpad scripts from this
  session show the pattern (hover, filter-latency, screenshots).
- Changing `WORKING_SET_WHERE` (server artifact) needs a **dev-server restart** —
  the artifact is cached in-process; a reload alone won't rebuild it.

## Delivery discipline (do not skip)

- Branch → PR → `main`. **Never develop on `main`. Never `gh pr merge` — the user
  merges PRs themselves.** Push the branch, open/append to the PR, hand off.
- All build/deploy/infra is via GitHub Actions, never local gcloud/terraform.
- Use the repo's brainstorm→spec→plan skills for design work; don't build ad-hoc.

## Designated future tasks (priority order)

### 1. Fix scatter filter-lag — "lazy names" (Option A) — DO THIS FIRST
The scatters render the full ~30k cloud on Canvas (great), but **a filter change
takes ~2.5s**. Cause: DuckDB-WASM marshals 2×30k rows *including the `name` string*
to JS on every filter change; string decode is the cost (numeric columns come back
as near-zero-copy typed arrays, strings allocate per row). Names never change with
filters, so re-pulling them is waste.

Fix:
- **Per-filter cloud query returns numbers only**: `SELECT avg_weight AS x,
  avg_rating AS y, game_id` (drop `name`). This is the query that re-runs on every
  filter → now marshals ~zero strings.
- **Build an `id → name` Map once at catalog load** (one pass over id+name pairs).
- ScatterChart takes `game_id` on each datum + a `nameOf(id)` resolver; the tooltip
  snippet resolves the hovered point's name via the Map (O(1), no query).
- Re-measure filter-update latency (target < ~300ms) with the Playwright pattern.

Files: `src/lib/catalog/aggregates.ts` (scatterSql/popularitySql),
`src/lib/charts/ScatterChart.svelte`, `src/lib/catalog/views/Overview.svelte`
(owns the map), and wherever the catalog finishes loading
(`src/lib/catalog/catalog.svelte.ts`).

### 2. Step 5 — client-side search picker in the nav
Type-to-jump to a game (name search over the in-browser catalog), route to
`/games/{id}`. Last remaining step in the plan.

### 3. Filter redesign for publishers / designers / artists — OPEN DESIGN THREAD
The user wants to scope the catalog by publisher/designer/artist (a core goal:
"view a designer's games all at once"). Data already exists in
`bgg-data-warehouse/definitions/games_features.sqlx` as `publishers`, `designers`,
`artists` (`ARRAY<STRING>`), same shape as the categories/mechanics/families facets
we already carry — just not selected into the artifact yet.

**Not a simple add:** these are high-cardinality (thousands each), so the top-15
checkbox facet UI does NOT work — they need a **type-to-search + chips** control in
the rail (distinct from the category checkboxes). This is a filter *redesign*, which
the user flagged ("obviously we would need to redesign the filters"). Treat as a
brainstorm→spec→plan effort, not a bolt-on. Also weigh a click-through:
designer name on a game row/detail → their whole catalog (an "entity" navigation).

Touches: `src/lib/server/catalog/columns.ts` (add to LIST_COLUMNS + serialize),
the artifact size (measure the bump), and the rail/scope.

### 4. Housekeeping (low priority)
- **Dev-only DuckDB sourcemap warnings** (~120 lines on server start). Harmless
  (worker build context). A prior top-level Vite `customLogger` fix was ineffective
  and reverted — needs a worker-context-aware approach.
- **`history.replaceState` warning** in `src/routes/(app)/games/+page.svelte`:
  SvelteKit wants `replaceState` from `$app/navigation` instead of raw
  `history.replaceState`. Swap it.

## Open threads with the user (not code tasks)
- Overall **Overview layout** is still the user's to shape — the current arrangement
  (two scatters lead, bars, categories full-width) is a starting point, not final.
- The user said "I need to tell you some things" re: filters and had more context to
  share before the filter redesign — surface that before starting task #3.

## Key files
- `src/routes/(app)/games/+page.svelte` — Explore shell, rail + view switcher, URL sync
- `src/lib/catalog/scope.ts` — Scope type, `toWhere` (SQL compile), URL round-trip
- `src/lib/catalog/Rail.svelte` — filter rail
- `src/lib/catalog/aggregates.ts` — all Overview/scatter SQL builders (+ `.test.ts`)
- `src/lib/catalog/views/Overview.svelte`, `Table.svelte` — the two views
- `src/lib/charts/{BarChart,RowBarChart,ScatterChart}.svelte` — reusable LayerChart wrappers
- `src/lib/catalog/catalog.svelte.ts` — in-browser DuckDB store (`initCatalog`, `query`)
- `src/lib/server/catalog/{columns,build,serialize,cache}.ts` — server artifact + `/api/catalog`
