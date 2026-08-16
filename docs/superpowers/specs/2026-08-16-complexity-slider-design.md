# BGG Viewer — Complexity Range Slider — Design

**Date:** 2026-08-16
**Status:** Proposed
**Builds on:** [2026-07-29-explore-workspace-design.md](2026-07-29-explore-workspace-design.md)
(established the rail and the shape strip) and
[2026-08-05-player-count-mode-design.md](2026-08-05-player-count-mode-design.md)
(same architecture: a new rail control over unchanged `Scope` fields)

## Goal

Filter complexity from the rail in one gesture.

Today the rail's only complexity control is a typed `min`/`max` pair at the bottom of the
collapsed **Exact numbers** group. Setting "roughly medium-weight" means opening a group,
finding the right row, and typing two numbers. The alternative is dragging the shape strip's
histogram, which works but is the only affordance and lives outside the rail.

Success: a user can bound complexity without typing and without leaving the pinned rail, and
the rail and the strip never disagree.

## The problem

The rail has two control vocabularies — segmented buttons (universe, player count) and
checkbox facet lists (categories, mechanics, families) — and **no vocabulary for a numeric
range**. So every numeric filter was either exiled to the shape strip or demoted to a typed
input. The asymmetry is visible: player count gets six one-click buttons pinned at the top,
while complexity, an equally common question, is five scrolls away behind two text fields.

## Decision

A **two-handle range slider** in the pinned block, immediately after Player count.

```text
COMPLEXITY  1.9 – 3.4
[----●===========●-----]
 light            heavy
```

### Native range inputs, not a hand-rolled drag

Two overlaid `<input type="range">` elements, styled to match the rail. The grabbed handle is
raised on `pointerdown` so the handles can cross without sticking.

This is the load-bearing decision, and the reason is accessibility rather than effort. The
strip's brush is deliberately **not** keyboard-operable —
[`MiniHistogram.svelte`](../../src/lib/charts/MiniHistogram.svelte) says so outright:

> "the plot is a labelled image, not a control — the rail's number inputs are the accessible
> path to the same scope fields"

That justification depends on the typed inputs existing. This change removes them, so the
slider must carry the accessible path itself. Native inputs supply arrow keys, Home/End, focus
rings, and screen-reader announcement with no custom code; a hand-rolled SVG drag like the
strip's would supply none of it and would leave complexity with **no** keyboard path at all.

### Null at the edges

A handle parked at an outer edge emits `null` for that bound, not the boundary number:

| Handle position | Emits |
|---|---|
| bottom at 1.0 | `weightMin: null` |
| top at 5.0 | `weightMax: null` |
| both at edges | both `null` — no chip, nothing excluded |

Same semantics the strip's brush already uses, so "no limit" stays distinct from "bounded at
the extreme". Without this, a full-width slider would emit `weightMin: 1, weightMax: 5`,
adding two chips and a WHERE clause that filter nothing.

**On the domain:** complexity is BGG's 1–5 weight scale and the slider's domain is 1–5. The
strip's axis reads "5.3" only because
[`ShapeStrip.svelte:148`](../../src/lib/catalog/views/ShapeStrip.svelte#L148) labels the last
bin's *outer* edge (`max(bucket) + WEIGHT_BIN`); a game at exactly 5.0 lands in the 5.00–5.25
bucket and produces that label. No out-of-range data needs accommodating. This is read from
the bucketing SQL, not separately verified against the warehouse — worth a glance during
implementation, and the null-at-top-edge rule makes it harmless either way.

### A generic component

`src/lib/catalog/RangeSlider.svelte`, parameterised by `domain`, `step`, `format` and endpoint
labels, owning no scope vocabulary. Year is the obvious second caller (see **Deferred** below);
building it generic now costs nothing and avoids a second implementation later.

Styling follows the rail's existing idiom — plain CSS in a `<style>` block, `var(--token)`
colors, the `.lbl` / `.note` class vocabulary. Not a component-library slider: the house
frontend skills describe shadcn-svelte / LayerChart patterns the rail does not currently use,
and the decision for this change is to match the app as built and revisit standardisation as
its own pass. See **Known drift**.

### State: unchanged

Writes `scope.weightMin` / `scope.weightMax` — the existing fields.

- `Scope` unchanged
- `toWhere`, `scopeToParams`, `scopeFromParams`, `activeChips` unchanged
- existing `?wmin=` / `?wmax=` links keep working
- the strip's complexity brush stays in sync for free, since both controls write the same two
  numbers

Presentation over unchanged state — the same architecture as the player-count mode toggle.

### What is removed

The typed complexity `min`/`max` pair in **Exact numbers**. Year, average rating, ratings count
and geek rating stay there untouched.

One filter, one control in the rail. Keeping both would repeat the confusion that the
player-count work just resolved, and the slider's step is fine enough to cover what the typed
fields were for.

## To be settled by looking at it

These are **deliberately not fixed here.** They are matters of feel, not architecture, and the
plan is to build a first pass and iterate in the browser:

| Parameter | First pass | Fallback / alternatives |
|---|---|---|
| Step granularity | `0.1` | `0.25` (the strip's `WEIGHT_BIN`) if 0.1 feels fussy — the track is ~310px for a 4-point domain, so 0.1 is ~7px per step |
| Value readout | in the group label (`COMPLEXITY 1.9 – 3.4`) | bubbles on the handles; both |
| Endpoint labels | `light` / `heavy` | `1` / `5`; none |
| One-bound wording | `up to 3.4` / `1.9+` | something terser |
| Track height / handle size | match `.seg` button proportions | whatever reads well at rail width |

Changing any of these is a prop or a CSS line, not a redesign.

## Affected files

| File | Change |
| --- | --- |
| `src/lib/catalog/RangeSlider.svelte` | **New.** Generic two-handle slider |
| `src/lib/catalog/Rail.svelte` | Complexity group in the pinned block; typed complexity pair removed from Exact numbers |
| `src/lib/catalog/range.ts` | **New.** Pure helpers: edge→null mapping, label formatting |
| `src/lib/catalog/range.test.ts` | **New.** Unit tests for those helpers |
| `src/lib/catalog/scope.ts` | **None** |
| `src/lib/catalog/views/ShapeStrip.svelte` | **None** — stays in sync via the shared fields |

No change to the Arrow artifact, `columns.ts`, the warehouse API, or any server code.

The edge→null mapping and label formatting live in `range.ts` rather than the component so they
can be unit-tested; this repo has no component-test harness and this change does not add one.
Same reasoning that put `setPlayerCount` in `scope.ts`.

## Deferred: stepping through years

The other half of the original conversation. "Flip through games published in a given year" is
a real gap — there is no year control in the pinned rail at all, and the three available paths
(brush the strip, type into Exact numbers, edit the URL) all make you re-specify the filter on
every step.

The likely answer is **not** this slider but a single-year value with `‹` `›` steppers: the
strip already handles year *ranges* well, and what it cannot do is *step*. Year is the one
filter whose consecutive values form a natural sequence — nobody walks complexity 2.1 → 2.2,
but 2019 → 2020 → 2021 is how you browse by era. That control would also want
`activeChips` to render `year 2019` rather than `year 2019–2019`.

It is deferred for a concrete reason: **vertical budget.** The pinned block currently ends
about a third of the way down the rail, with six collapsed groups beneath it. Adding complexity
(~3 rows) and year (~2 rows) together would push it toward half the rail before the first
facet, and Categories — open by default, the most-used group — gets pushed down with it.
Promoting one control at a time means the second decision gets made by looking at a real rail
instead of estimating.

## Known drift

Noted here so a later standardisation pass has a starting list, **not** to be acted on in this
change:

- `.claude/skills/frontend-patterns` prescribes LayerChart for all charts;
  `MiniHistogram` / `MiniColumns` / `Scatter` are hand-rolled SVG with a documented
  performance rationale.
- The same skill prescribes shadcn-svelte primitives and TanStack Table; neither is installed.
  Explore's list and rail are hand-rolled.
- The layout primitives (`Stack` / `AutoGrid` / `Split`) exist but Explore's workspace uses its
  own grid.

Token-driven color and light/dark discipline from `style-rules` **are** followed today, and this
change follows them.

## Verification

- `just check` — svelte-check, zero errors and zero warnings
- `just test` — Vitest, including the new `range.ts` coverage
- `just dev` in **both light and dark**: drag both handles, cross them, confirm the chips and
  the result count track the drag, confirm the strip's complexity brush and the slider agree in
  both directions, confirm a full-width range produces no chip
- **Keyboard:** tab to each handle, arrow-key it, Home/End — the accessible path the removed
  typed inputs used to provide
- Then iterate on the table above.
