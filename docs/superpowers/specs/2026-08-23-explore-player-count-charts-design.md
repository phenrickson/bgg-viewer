# BGG Viewer — Explore Player-Count Charts — Design

**Date:** 2026-08-23
**Status:** Implemented
**Builds on:** [2026-07-29-explore-workspace-design.md](2026-07-29-explore-workspace-design.md)
(the Shape Strip / Visualize-tab split), [2026-08-05-player-count-mode-design.md](2026-08-05-player-count-mode-design.md)
(`players` vs `bestAt` as separate `Scope` fields — unchanged here)

> Copy note: all user-facing strings below are **placeholder** — Phil writes the final copy.

## Goal

Add two visuals about player count to Explore, neither of which exists today:

1. **Supports N players** — how many games in scope have a box range
   (`min_players`–`max_players`) that covers N, for each N.
2. **Best / recommended at N players** — the community vote, split into two
   segments per N: voted *best*, and voted *recommended but not best*.

The catalog artifact already carries everything both need — `min_players`,
`max_players`, `best_player_counts`, `recommended_player_counts`
(`columns.ts`) — but only `best_player_counts` has ever been aggregated or
charted (`ShapeStrip`'s "most often best at" cell). "Supports N" and
`recommended_player_counts` have no chart at all.

## Where these live

The **Visualize tab** (`AnalysisPanel.svelte`), as two new figure cards, not
the Shape Strip. The Shape Strip is deliberately kept to a "read as part of
the header" size — five compact cells, always on screen. A 2-segment stacked
chart doesn't fit that grammar, and AnalysisPanel already has the room (an
`auto-fit minmax(20rem,1fr)` figure grid) and already receives both `where`
and `baseWhere`.

## Domain: 1–8

Matches `ShapeStrip`'s existing `BEST_AT_DOMAIN`. `best_player_counts` and
`recommended_player_counts` are only ever populated for player counts 1–8 —
the warehouse query that derives them filters `player_count IN ('1'..'8')`
(`best_player_counts.sqlx:36`) — so 8 is a data-truthful cap, not an
arbitrary UI choice, for both charts (kept consistent between the two even
though "supports" itself has no such ceiling in principle).

## Stacking semantics — the one real design call

`best_player_counts` and `recommended_player_counts` are **not nested**.
The warehouse derives them from independent thresholds:

- best: `best_percentage >= 40` (top 3 by that percentage)
- recommended: `positive_percentage` (`best + recommended` votes ÷ total)
  `>= 70` (top 5 by that percentage)

(`best_player_counts.sqlx:50`, `:58-59`.) A count can clear the *best*
threshold without clearing the separate *recommended* rank-and-percentage
cut, so naively stacking raw best-count + raw recommended-count would
double-count every game where a count is in both lists.

The chart instead stacks two **disjoint** counts:

- bottom segment — **best** (`list_contains(best_player_counts, v)`)
- top segment — **recommended, not best**
  (`list_contains(recommended_player_counts, v) AND NOT list_contains(best_player_counts, v)`)

Their sum is "games that voted positively on N," with no double-counting,
and the two segments read as "the strong vote" vs. "the softer vote."

## SQL

Two new builders in `aggregates.ts`, next to the existing
`bestAtDistributionSql`:

```ts
/** Games whose stated range (min/max players) covers each N in 1–8 — mirrors
 *  toWhere's own `players` predicate, so "supports N" means the same thing
 *  here as it does when scope.players filters the table. */
export const playerCountSupportSql = (where: string): string =>
  `SELECT v AS count, COUNT(*)::INT AS n
   FROM catalog, UNNEST([1,2,3,4,5,6,7,8]) AS t(v)
   WHERE ${where} AND min_players <= v AND max_players >= v
   GROUP BY v ORDER BY v`;

/** "Recommended, not best" — the stacked chart's top segment. Same UNNEST
 *  shape as bestAtDistributionSql, with a NOT list_contains guard so a count
 *  in both lists is attributed to `best` alone (see design doc). */
export const recommendedOnlyDistributionSql = (where: string): string =>
  `SELECT v AS count, COUNT(*)::INT AS n
   FROM (SELECT UNNEST(recommended_player_counts) AS v, best_player_counts
         FROM catalog WHERE ${where})
   WHERE v BETWEEN 1 AND 8 AND NOT list_contains(best_player_counts, v)
   GROUP BY v ORDER BY v`;
```

The existing `bestAtDistributionSql` is reused unchanged for the stacked
chart's bottom segment.

## Components

- **Supports N players** — `MiniColumns` as-is (no changes): domain 1–8,
  foreground from `playerCountSupportSql(where)`, backdrop from
  `playerCountSupportSql(baseWhere)` (same backdrop-vs-scope pattern as
  every other Shape-Strip-style chart), click sets `scope.players` and nulls
  `scope.bestAt`.
- **Best / recommended at N players** — new `StackedColumns.svelte`, a
  sibling of `MiniColumns.svelte`: same button-per-column / keyboard-reachable
  structure and `barScale`/`ScaleMode` reuse, but each column draws two
  stacked segments (`var(--chart-1)` best, `var(--chart-2)` recommended-only)
  instead of one foreground + backdrop silhouette. **No backdrop** — a third
  silhouette layer on top of two foreground segments is too much to read in
  a small chart, and the two-segment split already carries its own
  comparison. This matches AnalysisPanel's existing facet bars, which also
  don't draw a backdrop. Click sets `scope.bestAt` (either segment — the
  question is "best at N," which `scope.bestAt` already answers) and nulls
  `scope.players`, mirroring `ShapeStrip`'s existing best-at cell
  (`ShapeStrip.svelte:305-311`) and its exclusivity rule.
- A small two-swatch legend line ("■ best  ■ recommended") sits under the
  stacked chart's title — the single-color facet bars don't need one, but a
  stack does.

## No new `Scope` state

Both charts read existing fields (`players`, `bestAt`) — the prior
player-count-mode spec explicitly called a `recommended` scope field out of
scope, and nothing here needs one. Clicking the stacked chart's top segment
doesn't filter on "recommended, not best" specifically; it asks the same
"best at N" question the bottom segment and `ShapeStrip`'s cell already ask.
`toWhere`, `scopeToParams`, `scopeFromParams`, and `activeFilters` are
unchanged.

## Out of scope

- Any change to `ShapeStrip.svelte`, `scope.ts`, `Scope`, URL params, or
  filter chips.
- A `recommended`-specific filter/scope field (see above).
- Any Arrow artifact / `columns.ts` change — `recommended_player_counts` is
  already in the catalog.
- Extending either chart's domain past 8.

## Verification

- `just check` — svelte-check, lint, types
- `just dev` on localhost:5173, Explore → Visualize, **both light and dark**:
  confirm both new charts render with sane counts (spot-check one game
  against its known best/recommended players), confirm clicking a
  supports-bar sets the rail's "Plays with" chip and clears any "best at"
  chip, confirm clicking the stacked chart sets "best at" and clears "plays
  with," confirm the Shape Strip's own best-at cell moves in sync (shared
  `scope.bestAt`).
