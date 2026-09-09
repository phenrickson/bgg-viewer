# BGG Viewer — Front-End Standardization & Mobile — Plan

**Date:** 2026-09-09
**Spec:** [2026-09-09-frontend-component-adoption-design.md](../specs/2026-09-09-frontend-component-adoption-design.md)
**Status:** Awaiting approval (rewritten 2026-09-09 — TanStack dropped, mobile promoted to the goal)

## Goal

Standardize the front end on the presentation half of the source kit, and use that to make the
app work on a phone. **No TanStack** — see spec D1.

**Success:** open `/games` on a 375px screen and it works — filters reachable behind a drawer,
results readable, no clipped columns, no horizontal page scroll. Both themes. `just check` clean.

## Delivery rules

- Branch per PR, **stacked** in order. **Never on `main`.**
- **Phil merges every PR.** Never `gh pr merge`.
- Build/deploy is **Actions-only**. Locally: `just check`, `just test`, `just dev` only.
- `gh pr view --json state,mergedAt` before every push to a branch, not just once.
- No copy changes. Placeholder only, flagged, if a string is unavoidable.
- **Every PR verified in light AND dark**, and at 375px as well as desktop.

## Shape

Five PRs. PR 3 is the review gate — it is the first point where mobile visibly works.

| PR | What | Fixes (Appendix A) |
|---|---|---|
| 1 | Tokens — shadcn's eleven, plus input floor, tap targets, breakpoints | groundwork for #5, #6, #9 |
| 2 | Install presentation components. No TanStack. | — (inert) |
| 3 | **Explore shell on `Split` + filter drawer via `Sheet`** ← **gate** | #3 |
| 4 | Dense-row narrow strategy, shared by `GameList`/`GameRow` | #2, #4 |
| 5 | Residue — app bar, tooltips, `dvh` | #1, #7, #8 |

**PR 1 fixes nothing on its own** — an earlier draft of this table claimed #5 and it was wrong.
It defines tokens; every one of them is *applied* in a later PR. Specifically:

- **#5 (iOS input zoom)** cannot be fixed globally. The four offending inputs style themselves
  in Svelte `<style>` blocks, which compile to `input.s-xxx { font-size: 0.85rem }` — a
  class-plus-element selector that outranks any bare `input { … }` rule `app.css` could add.
  The floor has to be applied per component, which happens in PRs 2/3/5 as they are touched.
- **#9 (breakpoint sprawl)** is not fixed by a token either, because **a custom property cannot
  appear in a `@media`/`@container` prelude** — `@media (max-width: var(--bp-md))` is invalid
  and the whole block is dropped. That is a property of the CSS Variables spec, not a browser
  gap. The alternatives are `@custom-media` (unshipped in every browser; needs a PostCSS step
  this repo does not have) or Tailwind's `--breakpoint-*` namespace (real, but only drives
  utility variants in markup, not hand-written `@media` in scoped styles). So PR 1 states the
  canonical set as a documented convention, and #9 is actually fixed by **deleting queries** —
  `Split` and `AutoGrid` need none — which is PR 3's job, not PR 1's.

Recount for the record: the app has **12 layout media queries at 8 distinct widths**
(40rem, 560, 640, 720, 860, 900, 1100, 1280px), 9 of them outside `/dev`. An earlier draft said
five. Note `40rem` and `640px` are the same width written two ways.

---

### PR 1 — Design tokens

**Branch:** `feat/design-tokens` (off `main`) · **Files:** `src/app.css`

1. Add the eleven missing shadcn variables to `:root` and `.dark` in oklch, consistent with the
   warm-orange palette: `--popover(-foreground)`, `--secondary(-foreground)`,
   `--accent(-foreground)`, `--destructive(-foreground)`, `--input`, `--sidebar*`.
   `--destructive` resolves to the existing `--color-negative` — no second red.
2. Extend `@theme inline` so they map to Tailwind utilities like the existing ten.
3. Add the mobile primitives that have no component:
   - `--input-font-min: 1rem` — the 16px floor that stops iOS auto-zoom (**fixes #5**).
   - `--tap-min: 2.75rem` — the 44px target minimum, for PR 2's `Button` sizing and PR 5.
   - Named breakpoints replacing the five arbitrary widths (**groundwork for #9**).
4. **Preserve every existing comment.** The `--vote-*` reasoning is ~25 lines of real argument.

**Verify:** `just check` clean. `just dev` → every page **identical** in both themes; nothing
consumes the new tokens yet, so any visual change means something was overwritten. `git diff`
shows additions only.

**Risk:** low, purely additive.

---

### PR 2 — Install the presentation components

**Branch:** `chore/shadcn-svelte-install` (off PR 1)
**Files:** `package.json`, `pnpm-lock.yaml`, `components.json` (new), `src/lib/components/ui/*`

1. **Verify compatibility first.** Svelte 5.56 / Tailwind 4.3 / Kit 2.63. If `@latest` doesn't
   support this combination cleanly — **stop and report**, don't pin something that half-works.
2. `pnpm add bits-ui @lucide/svelte`. **Nothing from `@tanstack/*`.**
3. **Guard `app.css` through `init`** — it rewrites the file. Back up, run, diff, restore every
   deliberate line: palette, comments, `.chart-area`, `@custom-variant dark`, PR 1's tokens.
4. `add card button badge input sheet tooltip dialog checkbox separator scroll-area`.
   **Not** `table` — spec D1.
5. Confirm `components.json` points at `$lib/components/ui` without disturbing `layout/`.
6. Set `Button`'s size variants against `--tap-min` so tap targets are correct by default.

**Verify:** `just check` clean. Named imports resolve. `just dev` → **all pages render
identically**, both themes — this PR must be visually inert. Spot-check `AnalysisPanel`'s
fullscreen dialog specifically (preflight's `margin: 0` on `dialog` broke it once before).
`git diff src/app.css` empty or intentional-additions-only.

**Risks:** `init` clobbering `app.css` (step 3 exists for this); Tailwind preflight regressions
elsewhere (caught by the identical-render check).

---

### PR 3 — Explore: `Split` shell + `Sheet` filter drawer ← **the review gate**

**Branch:** `feat/explore-mobile-shell` (off PR 2)
**Files:** `src/routes/(app)/games/+page.svelte`. `Rail` gets a wrapper, not a rewrite.
`GameList`, `ShapeStrip`, `AnalysisPanel` and the filter controls are **untouched**.

This is where mobile first visibly works, and it delivers what the code already asked for at
`games/+page.svelte:380`: *"A proper narrow layout wants the filters behind a drawer with the
results first."*

**Prerequisite — `Split` cannot do this job as written.** Two defects, found in review, in a
primitive that has **never been used by any page** and so has never been exercised:

1. **The basis is percentage-only.** `SPLIT_BASIS` offers `half: 50%`, `aside-narrow: 34%`,
   `aside-wide: 40%`, applied as `flex: 0 0 var(--aside-basis)`. Explore's rail is a fixed
   `16rem`. Inside `Container size="wide"` (112rem cap), `aside-narrow` resolves to **38rem —
   2.4× the current rail** on a wide screen. That is not equivalence, it is a visible redesign.
   `Split` needs a fixed-length basis option (e.g. `basis="16rem"`) before Explore can use it.
2. **`at="sm"` is a dead prop.** `SplitAt = 'sm' | 'md'`, but the stylesheet only defines
   `.at-md` inside `@container (min-width: 35rem)`. There is no `.at-sm` rule at all, so
   `at="sm"` silently leaves the region permanently stacked. Nobody has hit it because nobody
   has used `Split`.

Additionally, 35rem is almost certainly the wrong collapse point for Explore: a 16rem rail
beside a dense games table needs roughly 56rem before both are usable, not 35rem.

So PR 3 starts by **fixing the primitive** — fixed-basis support, a real `at="sm"` rule, and a
collapse threshold Explore can actually use. Do that as the first commit of this PR, not as a
silent workaround inside the page, or the next page to reach for `Split` hits the same wall.

1. **Shell** — replace `grid-template-columns: 16rem minmax(0, 1fr)` with the fixed-basis
   `Split`. Preserve the two independently scrolling columns and the fill-height behaviour from
   `Container size="wide" fill`. **Preserve `.canvas`'s `container-type: inline-size`** —
   `GameList`'s `@container (max-width: 62rem)` column-shedding resolves against it, and PR 4
   builds on that.
2. **Drawer** — below the narrow breakpoint, the rail moves into a `Sheet` behind a "Filters"
   trigger, with results first. Above it, the rail stays exactly where it is. `Rail` itself is
   not rewritten — it is placed in a different container.
3. Trigger shows active-filter count, so it is legible that filters are applied while hidden.
4. Delete the `@media (max-width: 900px)` block that stacks a 20rem scrolling filter box above
   the results — the drawer replaces it (**fixes #3**).
5. Rename any Tailwind-colliding scoped class in this file.
6. Otherwise **equivalence**. Desktop Explore should be indistinguishable from `main`.

**Verify:**
- `just check` clean; `just test` passing.
- **375px:** results visible first; drawer opens/closes; filters apply and the list updates;
  trigger count correct; no horizontal page scroll.
- **Desktop:** side by side against `main` — rail, scope, sort, paging, universe switch,
  List/Visualize toggle, row → detail navigation all unchanged.
- **Both themes.**
- Record the real cost — time, lines removed vs added, anything the primitives couldn't do.

**Risks:** Explore is the most important page (mitigated: branch, local review, Phil merges).
Scope creep — 11 other Explore components sit right there and are out of scope.

---

## Gate — stop here

Phil reviews Explore locally, on a phone-width window. Outcomes:

- **Continue to PR 4/5** as planned.
- **Change the narrow strategy** for PR 4 having seen PR 3 at 375px.
- **Stop.** Two revertible PRs and one small feature is a cheap answer if the primitives don't
  deliver.

Also decided here: finish Explore's remaining components, sweep the app, or adopt-on-contact.

---

### PR 4 — Dense-row narrow strategy *(post-gate)*

**Branch:** `feat/dense-row-narrow` · **Files:** `GameList.svelte`, `GameRow.svelte`,
`discover/+page.svelte` (its `.collhead` mirrors `GameRow`'s template and must move in step)

Rows stay **anchors on a CSS grid** — spec D2. This is a grid-template problem, not a component
one, and both lists get the same answer so they stop diverging.

1. Fix the clipping defect: `.listwrap { overflow: hidden }` currently makes overflowing columns
   unreachable rather than scrollable (**#2**).
2. Give both lists a narrow strategy below the point where columns stop fitting — shed further,
   scroll horizontally with a pinned name column, or stack into a card row. **Decide from what
   PR 3 looks like at 375px**, not now (spec open question 2).
3. `GameList` currently bottoms out at ~585px against 335px available; `GameRow` at ~388px.
   Both must fit 335px with no clipping.
4. Preserve the encodings — `Gauge`, `ComplexityMeter`, `PlayerPips`, the two-line name cell.
   They are why it isn't a plain table.

**Verify:** 375px with no horizontal scroll and nothing clipped, both lists; desktop unchanged;
both themes; sort/page/navigate still work.

---

### PR 5 — Residue *(post-gate)*

**Branch:** `fix/mobile-residue` · **Files:** `+layout.svelte`, `AnalysisPanel.svelte`,
`StackedColumns.svelte`, `MiniColumns.svelte`, `VizOfTheDay.svelte`

1. **App bar + footer** (**#1**) — wrap or collapse behind a menu; truncate the user email.
   Currently one no-wrap `flex` row that overflows at 375px.
2. **Touch tooltips** (**#7**) — `StackedColumns:149` and `MiniColumns:82` use
   `onmouseenter`/`onmouseleave`; `VizOfTheDay:850` is a pure CSS `:hover` reveal. All
   unreachable on touch. Move to `Tooltip`/`Popover`, or pointer events with `touch-action`
   like `MiniHistogram` and `Scatter` already do correctly.
3. **`dvh`** (**#8**) — `AnalysisPanel:686` uses `100vh`/`100vw` for fullscreen; on mobile `vh`
   is the large viewport so the bottom hides under the URL bar.
4. Remaining sub-16px inputs and sub-44px tap targets not caught by PRs 1–2.

---

## Also, whenever convenient

- **Delete `src/lib/query/keys.ts`** — a fossil of the superseded MVP server-backed design,
  imported by nothing (spec, Cause 2).
- **Resolve `src/app.d.ts`'s `breadcrumbs?`/`subtitle?`** — typed, never populated or read.
- **Skill:** add a data-pattern section stating the DuckDB-WASM architecture and explicitly
  ruling out TanStack Query, so this cannot recur. Reconcile the rest with what shipped.
- **`front-end-design`:** deferred until PRs 1–3 have run, so the upstream correction is written
  from what actually broke rather than guessed at.

## Out of scope

TanStack anything. Migrating all 156 files. Porting `Scatter.svelte` to LayerChart. Any data-layer
change. Deployment.

## Open questions

1. If `shadcn-svelte@latest` doesn't support Svelte 5.56 / Tailwind 4.3 cleanly — stop and
   report, or pin older? PR 2 assumes **stop and report**.
2. PR 4's narrow strategy — deliberately deferred until PR 3 is on screen at 375px.
