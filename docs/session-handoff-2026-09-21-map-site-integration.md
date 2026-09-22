# Handoff — embedding map, site integration

**Branch:** `feat/embedding-map` (PR #71, open)
**Date:** 2026-09-21
**State:** 7 commits ahead of `origin/feat/embedding-map`, **none pushed**. Working tree clean.
`pnpm check` 0 errors, `pnpm test` 343 passing, `pnpm build` passes.

Plan of record: `docs/superpowers/plans/2026-09-21-embedding-map-site-integration.md`
Original spec: `docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md` (v1)

---

## What this session was for

Taking `/dev/map` from a bench built for one user to something that reads as part of the
site. The map itself — `PointCanvas`, `MapLayer`, the coordinates artifact, the projections
— was already the clean part and is mostly untouched. The work was chrome, layout and
interaction.

## Commits

| | |
|---|---|
| `845d391` | dev server to port 4300 (`port` var in the justfile + `vite.config.ts`) |
| `0cbde4c` | selection panel overlays the canvas; markers track regl's point scale |
| `bd3f3b3` | the plan |
| `a598b78` | rail + canvas workspace matching `/games` |
| `a33ca63` | **extract `RailGroup` / `SegGroup`, refactor `Rail.svelte` onto them** |
| `58c169e` | lasso filters and frames; map rail rebuilt on the shared components |
| `49b5a44` | group the rail by order and a divider |

`a33ca63` is the one that touches Explore. It is deliberately a separate commit so it can be
reverted without losing the map work.

## Two real bugs fixed, with their mechanisms

**Selection rings landed off their points.** The selection table used to be a sibling below
the map, so it mounted from zero and resized the canvas. regl's `getScreenPosition` scales by
its *own* `currentWidth`/`currentHeight`, updated by regl's `ResizeObserver` on the canvas;
ours is on the host and — registered first, since regl's is created in an async `import()` —
always ran first, repainting the overlay against the old size. Every marker was off by the
resize delta. Fixed by docking the panel inside the canvas frame so nothing resizes.

**Markers drifted as you zoomed.** regl's default `pointScaleMode: 'asinh'` grows points with
the camera while the overlay drew at a constant radius. `OverlayApi` now carries `pointScale`
(regl's factor minus the dpr term, since screen positions are CSS pixels) and `MapLayer`
multiplies by it.

**The page froze on a large lasso.** Applying a filter shrinks `visible`, which can force a
full positional redraw of every point; queueing a camera transition in the same tick locked
it up. The framing effect in `PointCanvas` now returns early unless `drawn` is true, so the
zoom lands after the set settles.

## Where things stand

Working: rail + canvas workspace; lasso filters, frames and leaves the list shut; click
selection still highlights and opens the panel; selection panel overlays and collapses;
timeline in the rail.

**Left undone, in rough priority order:**

1. **`yearActive` is unused.** The prop exists on `MapRail` and is not passed from the page,
   so the Filters badge does not count the year scrubber. One line.
2. **Colour is the last native `<select>`** in the rail, next to a segmented Size. Six options
   is past what one segmented row holds at 16rem; two rows of three would make the rail
   consistent.
3. **Initial framing.** `PointCanvas.svelte`'s framing uses the NDC square `[-1,1]²` rather
   than the data extent, which is why the plot sits small in a large frame with dead margins.
4. **The `+3` ring pad is constant**, so the ring/dot ratio runs from ~4× at 30 ratings to
   ~1.33× at the top. A proportional pad with a floor would even it out.
5. **Selection panel presentation.** One selected game probably wants a card (thumbnail,
   link); a lasso wants the table. Same panel, two presentations.
6. **The `bgg-viewer` skill.** Agreed but not started — see below.

Still open on PR #71 itself, independent of this work: the Sigma vs `NetworkLayer` renderer
decision, the production path for the network, and promoting the route out of `/dev`.

## Things that will bite you

**`.collapse` is a Tailwind utility** (`visibility: collapse`) and the global utility layer
beats a component's scoped rule. A button classed `.collapse` rendered at full width with its
text intact and was simply invisible; it took a `getComputedStyle` dump to find. `Rail.svelte`
already warns about this for `.fixed` and `.grow` — the warning was not enough to stop it
happening. Check any single-word class against Tailwind's utility list.

**`<details bind:open>`, never `<details {open}>`.** The latter compiles to `details.open =
open()` inside the render effect and re-asserts on every rerun, slamming the group shut as you
type in it. `RailGroup` handles this; keep it that way.

**The frontend-patterns skill describes a different codebase.** It documents breadcrumbs +
subtitle from server load, `Card.Kpi`, `AutoGrid`, TanStack tables. **None of that exists
here.** `/games` titles itself with `<svelte:head><title>` and renders no `<h1>`; the root
layout is nav + `Container` + content. `Container size="wide" fill`, `Sheet` and `Button` are
real. Verify each primitive before using it.

**Do not start or stop the dev server without asking.** The user runs it in their own
terminal. Verify with `svelte-check` and `vitest`. (I killed theirs with an `lsof | xargs
kill` cleanup.)

**Credentials.** `.zshrc` defaults `GOOGLE_APPLICATION_CREDENTIALS` to `adc-aebs.json`, which
has no access to `bgg-data-warehouse`. `use-personal` unsets it. If BigQuery 403s, that is
why. `.env` has `CATALOG_SOURCE=bigquery` added this session — it only silences an expected
GCS signing-failure log; it does not affect build time, and the user may want it reverted.

## The design-language problem — read this before touching CSS

This was the recurring failure of the session and cost the most time.

The pattern: I read the existing components, understood them well enough to quote their
reasoning, and then **wrote new CSS anyway instead of using them**. The first `MapRail` copied
`Rail.svelte`'s values by hand and drifted immediately — native selects where the house uses
segmented buttons, no section headings, no accent on active states. The user put the two rails
side by side and the difference was obvious.

`a33ca63` is the corrective: `RailGroup` and `SegGroup` now exist in `src/lib/catalog/rail/`,
and `Rail.svelte` itself uses them, which is the proof they fit. **Build from those.** If you
find yourself writing a comment that says your CSS "matches" another component, stop and
extract instead — I wrote exactly that comment and it was the tell.

Second pattern, on the rail sections: I shipped a heading style that was too loud (bold,
sentence-case, dark — foreign to a rail of 0.72rem uppercase muted labels), then one that was
too quiet (identical to the control labels, so hierarchy vanished). The resolution was to drop
the headings and let order plus a heavier rule carry the grouping. If you reintroduce section
labels, they need to differ from control labels by something other than size and weight.

The user's standing instruction: **use the repo's existing components and visual language**.
There is a `bgg-viewer` skill planned to write this down, built from what actually survives
rather than from assertion — that was the agreed sequence and it has not been started.

## Verify

```sh
pnpm exec svelte-check --tsconfig ./tsconfig.json   # 0 errors; 9 pre-existing warnings in AnalysisPanel
pnpm exec vitest run --passWithNoTests              # 343 passing
```

Ask before running the dev server. Check light **and** dark — the map's palette work is
dark-first, so light is the likelier regression, and nothing in this session was verified in
light mode.
