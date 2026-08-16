# Player-Count Filter Mode — Implementation Plan

**Date:** 2026-08-05
**Spec:** [2026-08-05-player-count-mode-design.md](../specs/2026-08-05-player-count-mode-design.md)
**Branch:** `feat/player-count-mode`

## Goal & success criteria

Put "best at N" in the rail behind a mode toggle over the existing number row. Done when a user
can filter best-at without touching the strip, the rail and strip never disagree, and
`?best=4` links still work.

## Affected files

- `src/lib/catalog/Rail.svelte` — the toggle, the rewired row, the mode-dependent note
- `src/lib/catalog/views/ShapeStrip.svelte` — one line in `onpick`
- `src/lib/catalog/scope.test.ts` — exclusivity coverage
- **Not touched:** `scope.ts`, `columns.ts`, anything under `src/lib/server/`, any workflow

## Steps

One PR — the change is two components and a test, and splitting it would ship a half-wired
toggle. Small enough to review in one pass.

### 1. Rewire the rail group

In `Rail.svelte`:

- `let pcMode = $state<'players' | 'bestAt'>(scope.bestAt != null ? 'bestAt' : 'players')`
- An `$effect` keeping the mode following state: if `scope.bestAt != null` and mode is
  `players`, flip to `bestAt`. Covers the strip-click and hydrate paths from the spec.
- Replace `setPlayers` (line 61) with a mode-aware setter: writes the active field, toggles off
  on re-click of the lit number.
- `setPcMode(m)`: early-return if unchanged (the `setUniverse` shape), else null the *other*
  field and set the mode.
- Markup: a `.seg.two` toggle above the existing `.seg` row; the row's `class:on` / `aria-pressed`
  read the active field. Placeholder labels + placeholder note per mode, flagged for Phil.

**Verify:** `just dev` — toggle modes and watch the chip and the result count change; confirm
`aria-pressed` is right on both rows; both light and dark.

### 2. Make the strip enforce the same exclusivity

`ShapeStrip.svelte:305` — `onpick={(v) => { scope.bestAt = v; if (v != null) scope.players = null; }}`

Guarded on `v != null` so clearing via the strip's toggle-off doesn't clear an unrelated
`players` the user set afterward.

**Verify:** `just dev` — set Plays-with 4, click best-at 2 on the strip; the plays-with chip
goes away and the rail toggle reads Best-at.

### 3. Test the exclusivity

`scope.test.ts` — the mutual-exclusion logic lives in the component, so cover what's testable
without a DOM: that `toWhere` still compiles each field alone and both together (the existing
`:85` test already covers both-together and needs no change), and that `p`/`best` still
round-trip (`:312-319`, unchanged).

**Decided:** extracted. `setPlayerCount(scope, mode, n)` returns a `{players, bestAt}` patch and
`playerCountModeFor(scope)` derives the mode; both are unit-tested in `scope.test.ts` (9 tests,
including the invariant that no call can leave both fields set). No component-test harness added.

**Verify:** `just test`.

### 4. Full check + PR

`just check`, `just test`, then open a PR to `main`. **Phil merges.**

## Risks / unknowns / rollback

- **Behavior change:** the both-set combination becomes UI-unreachable. Called out in the spec;
  it stays reachable by hand-written URL.
- **`$effect` loop risk:** the mode-follows-state effect writes `pcMode` only, never `scope`, so
  it can't cycle with the setters that write `scope`. Worth a second look during
  implementation — an effect that wrote both would loop.
- **Rail vertical space:** one more `.seg` row in the pinned block. If it crowds the pinned
  area, the fix is the note, not the toggle.
- **Rollback:** revert the two component edits; `Scope` never changed, so no data or URL
  migration.

## Out of scope

Per the spec: no predicate changes, no "recommended at N" mode, no 7/8 in the rail, no strip
restyle, and not the second feature from this session.
