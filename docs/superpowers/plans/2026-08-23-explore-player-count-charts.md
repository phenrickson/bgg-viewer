# Explore Player-Count Charts — Implementation Plan

**Date:** 2026-08-23
**Spec:** [2026-08-23-explore-player-count-charts-design.md](../specs/2026-08-23-explore-player-count-charts-design.md)
**Branch:** `feat/explore-player-count-charts`

## Goal & success criteria

Add two charts to Explore's Visualize tab: "supports N players" (bar) and
"best/recommended at N players" (stacked bar). Done when both render with
sane counts, both click-to-filter through existing `Scope` fields
(`players`, `bestAt`) with no new state, and the Shape Strip's own best-at
cell stays in sync since it shares `scope.bestAt`.

## Affected files

- `src/lib/catalog/aggregates.ts` — two new SQL builders:
  `playerCountSupportSql`, `recommendedOnlyDistributionSql`
- `src/lib/charts/StackedColumns.svelte` — new component
- `src/lib/catalog/AnalysisPanel.svelte` — two new figure cards + query batch
- **Not touched:** `ShapeStrip.svelte`, `scope.ts`, `columns.ts`, anything
  under `src/lib/server/`, any workflow

## Steps

One PR — two SQL builders, one new leaf chart component, and wiring into an
existing panel. Small enough to review in one pass.

### 1. Aggregates

In `aggregates.ts`, next to `bestAtDistributionSql`: add `playerCountSupportSql`
and `recommendedOnlyDistributionSql` exactly as written in the spec's SQL
section. Both return `PlayerCountBin[]` (`{ count, n }`), the same shape
`bestAtDistributionSql` already returns — no new type needed.

**Verify:** eyeball the SQL against `toWhere`'s `players` predicate
(`scope.ts:309-310`) and `bestAtDistributionSql` (`aggregates.ts:132-136`)
for the pattern match.

### 2. `StackedColumns.svelte`

Copy `MiniColumns.svelte`'s structure (button-per-column, `barScale`,
`ScaleMode`, keyboard/focus handling, `.col`/`.plot`/`.lab` styling) and
change the props/render to two series instead of foreground+backdrop:

```ts
let {
  bins,        // best series: ColBin[]
  bins2,       // recommended-only series: ColBin[]
  domain,
  selected = null,
  colors = ['var(--chart-1)', 'var(--chart-2)'],
  height = 46,
  scaleMode = 'count',
  label, title, onpick
}: { ... } = $props();
```

Each column stacks `bins2[v]` on top of `bins[v]` (both against one shared
scale total, so `barScale([bins, bins2], scaleMode)` — pass both series in,
same idea as `MiniColumns` passing `[backdrop, bins]`). No `backdrop` prop,
no `.back`/`.backline` layer.

**Verify:** a quick standalone render (temporarily drop it into a dev page,
or just read through against `MiniColumns` line by line) — two visibly
distinct colored segments per column, heights summing correctly under both
Count and Share scale modes.

### 3. Wire into `AnalysisPanel.svelte`

- Import `MiniColumns`, `StackedColumns`, the two new aggregate builders,
  and `bestAtDistributionSql`.
- New `$state` arrays: `supportsBins`, `supportsBackdrop`, `bestBins`,
  `recommendedOnlyBins`.
- Extend the existing `Promise.all` in the `$effect` (`:82-114`) with:
  `query<PlayerCountBin>(playerCountSupportSql(w))`,
  `query<PlayerCountBin>(playerCountSupportSql(bw))` (backdrop),
  `query<PlayerCountBin>(bestAtDistributionSql(w))`,
  `query<PlayerCountBin>(recommendedOnlyDistributionSql(w))`.
- Two new `.figure` blocks in the grid (near the facet-chart snippets,
  `:264-290`):
  - "Supports N players" — `<MiniColumns bins={supportsBins} backdrop={supportsBackdrop} domain={[1..8]} selected={scope.players} onpick={...} />`
  - "Best / recommended at N players" — legend line, then
    `<StackedColumns bins={bestBins} bins2={recommendedOnlyBins} domain={[1..8]} selected={scope.bestAt} onpick={...} />`
- `onpick` handlers mirror `ShapeStrip.svelte:305-311`'s exclusivity:
  supports sets `scope.players` (toggle off on re-click) and nulls
  `scope.bestAt` when set; stacked sets `scope.bestAt` and nulls
  `scope.players` when set.

**Verify:** `just dev`, Explore → Visualize, both light and dark — charts
render, click-to-filter round-trips through the rail's chips and the Shape
Strip's own best-at cell.

### 4. Full check + PR

`just check`, then open a PR to `main`. **Phil merges.**

## Risks / unknowns / rollback

- **Query cost:** `playerCountSupportSql` cross-joins `catalog` with an
  8-row domain (`UNNEST([1..8])`). Worst case (`top10k`/`rated` universe,
  tens of thousands of rows × 8) is the same order of magnitude as the
  existing scatter queries (`SCATTER_LIMIT = 60000`), which already run
  per-filter-change — expected to be well within the panel's existing
  latency feel, but worth a rough timing check during `just dev` if it
  looks sluggish.
- **Panel effect grows to 8 parallel queries.** All keyed on `where` (the
  backdrop query is the only one keyed on `baseWhere`, same as every other
  builder here that takes it) — no new effect needed, just more entries in
  the existing `Promise.all`.
- **Rollback:** all three files are additive (new exports, new component,
  new figures) — reverting is a clean revert of one PR, nothing shared
  changes shape.

## Out of scope

Per the spec: no `ShapeStrip` change, no new `Scope` field, no `columns.ts`/
artifact change, no domain past 8.
