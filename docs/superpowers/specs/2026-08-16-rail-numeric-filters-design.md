# BGG Viewer — Numeric Filters in the Rail — Design

**Date:** 2026-08-16
**Status:** Implemented
**Builds on:** [2026-07-29-explore-workspace-design.md](2026-07-29-explore-workspace-design.md)
(established the rail and the shape strip) and
[2026-08-05-player-count-mode-design.md](2026-08-05-player-count-mode-design.md)
(the precedent: a new rail control over existing `Scope` fields)

## Goal

Make complexity and year filterable **from the rail**, in the vocabulary the questions actually
use.

Before this, the rail had two control vocabularies — segmented buttons (universe, player count)
and checkbox facet lists (categories, mechanics, families) — and **nothing for a numeric
measure**. So every numeric filter was either exiled to the shape strip or demoted to a typed
`min`/`max` pair at the bottom of a collapsed "Exact numbers" group. Player count got six
one-click buttons pinned at the top; complexity, an equally common question, was five scrolls
away behind two text fields, and year had no rail control at all.

## What shipped

Two new groups, both `<details>` shaped like the facet groups already in the rail:

| Group | Control | Writes |
| --- | --- | --- |
| **Complexity** | Five band checkboxes | `weightBands: number[]` (new) |
| **Year** | `‹` `›` steppers + typed from/to | `yearMin` / `yearMax` (existing) |

Rail order: Complexity, Categories, Mechanics, Series & families, People & publishers, Year,
Exact numbers.

## Complexity: bands, not a range

Weight is the one numeric measure people already discuss in words — "medium-heavy", not "3.0 to
3.5". So the bands are the vocabulary, and the control is the one the rail already uses for
categories: a `<details>` of checkboxes.

### Checkboxes OR together

This is the whole reason bands beat a range. Checking **Light** and **Heavy** means "either end,
nothing in between" — a real selection that compiles to an OR:

```sql
(average_weight < 2.0 OR average_weight >= 3.5)
```

A `weightMin`/`weightMax` span cannot express that. Its best attempt is `1–5`, which silently
includes everything the user just declined to check. Any design that makes two checked boxes
mean "the range spanning them" is a filter lying about its own selection.

### Half-open bands, boundary to the upper band

`COMPLEXITY_BANDS` (moved from `discover/dials.ts` to `catalog/scope.ts`) defines five bands with
`min` inclusive and `max` exclusive. A 3.0 game is Medium-Heavy, not Medium — one rule applied
consistently, so no game lands in two bands and none falls between them. The first band has no
floor and the last no ceiling, so the five cover the whole scale.

The bands moved because `toWhere` needs the cutoffs and `dials.ts` already imports from
`scope.ts`; importing back would be circular. `dials.ts` re-exports them, so Discover's callers
are unchanged.

### Purely additive

`weightMin` / `weightMax` **stay exactly as they were.** The band list is a second, coarser
filter on the same measure, and the two AND together like any other pair of filters. Which
means:

- the shape strip still brushes a free complexity range
- Discover's dial still works, untouched
- the landing page's `weightMax: 2.0`-style chips still work
- `?wmin=` / `?wmax=` links still work
- the typed complexity pair stays in Exact numbers, as the keyboard path to a free span

Adding a control did not require taking anything away.

## Year: steppers that shift the window

The task is to **walk** the catalog by era: see 2019, then 2020, then 2021, with every other
filter held still.

Neither existing path can do that. The strip's brush is a drag across ~130 bins where one pixel
is about a year — imprecise for landing on a specific year. The typed pair means editing two
fields to say "2019". Both make you re-specify the whole filter on every step.

### One rule: `‹` `›` shift the whole window

`stepYear` moves the range rather than collapsing it:

| Starting state | `›` gives |
| --- | --- |
| 2019 (single year) | 2020 |
| 2015–2020 (brushed span) | 2016–2021 |
| 1990+ (half-open) | 1991+ |
| nothing set | the current year |

Shifting is what lets one rule cover every shape. The alternatives both punish you for having
used the strip: collapsing destroys a range you deliberately brushed, and disabling kills the
control exactly when you reach for it. Here nothing is discarded and there is no mode to be in.

At an edge the window **stops without shrinking** — 2024–2029 stepped by +10 parks at 2025–2030,
not 2030–2030. That requires clamping the window rather than each bound independently, and has
its own test.

### No `Scope` change

`yearMin = yearMax = 2019` already expresses a single year, so the steppers need no new field, no
new URL param, and no `toWhere` change. Year's typed pair moved out of Exact numbers and into
this group, so year lives in one place rather than split across two.

## Affected files

| File | Change |
| --- | --- |
| `src/lib/catalog/scope.ts` | `weightBands` field + OR predicate + `wband` param + per-band chips; `COMPLEXITY_BANDS` / `bandAt` moved in; `stepYear` |
| `src/lib/catalog/ComplexityBands.svelte` | **New.** Band checkboxes |
| `src/lib/catalog/YearFilter.svelte` | **New.** Steppers + typed pair |
| `src/lib/catalog/Rail.svelte` | Both groups wired in; year removed from Exact numbers; `exactCount` adjusted |
| `src/lib/discover/dials.ts` | Imports and re-exports the bands from `scope.ts` |
| `src/lib/catalog/scope.test.ts` | 19 new tests |
| `src/lib/catalog/views/ShapeStrip.svelte` | **None** — its brush is untouched |

## Superseded within this change: the range slider

The first attempt at complexity was a two-handle range slider (`RangeSlider.svelte` +
`range.ts`, still on disk, currently no caller — see **Open**). Bands replaced it in the rail
for the OR reason above: a slider is a *span* control, and complexity wanted a *set* control.

What the slider work established and this design kept: native `<input type="range">` over a
hand-rolled pointer drag, because the strip's brush is deliberately not keyboard-operable
(`MiniHistogram` calls itself "a labelled image, not a control") and justified that by pointing
at the rail's typed inputs as the accessible path. Any rail control replacing those inputs has
to carry that path itself. The band checkboxes and the year steppers are native controls for the
same reason.

## Open

- **`RangeSlider.svelte` / `range.ts` / `range.test.ts` have no caller.** They were parked for
  year, but year shipped with steppers. Keep for a future span filter, or delete.
- **Vertical budget.** Both groups are collapsible `<details>`, which is what let both ship at
  once — the earlier concern was that two always-open controls would push Categories below the
  fold. Complexity defaults open, year shut. Worth revisiting once the rail is used in anger.

## Known drift

Recorded for a later standardisation pass, **not** acted on here (the decision for this change
was to match the app as built):

- `.claude/skills/frontend-patterns` prescribes LayerChart for charts; `MiniHistogram` /
  `MiniColumns` / `Scatter` are hand-rolled SVG with a documented performance rationale.
- The same skill prescribes shadcn-svelte primitives and TanStack Table; neither is installed.
- The layout primitives (`Stack` / `AutoGrid` / `Split`) exist but Explore's workspace uses its
  own grid.

Token-driven color and light/dark discipline from `style-rules` **are** followed, here and
throughout.

## Verification

- `just check` — 1991 files, 0 errors, 0 warnings
- `just test` — 184 pass, 19 new: band boundaries, the non-adjacent OR, gapless coverage,
  ANDing with the free range, the predicted column in `upcoming`, per-band chips, `?wband=`
  sanitizing, and `stepYear`'s single-year / span / half-open / edge-clamp cases
- Confirmed working in the browser by Phil
- Still to do: a light-mode pass, and keyboard checks on both new groups
