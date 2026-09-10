# BGG Viewer — Front-End Design System — Plan

**Date:** 2026-09-09
**Spec:** [2026-09-09-frontend-component-adoption-design.md](../specs/2026-09-09-frontend-component-adoption-design.md)
**Status:** PR 1 shipped; PR 2 awaiting approval

## Goal

Build the five-layer system in the spec, **vertically on Explore** — the page that contains every
pattern in the app — then migrate the rest onto it. Mobile-correct by construction, not by fixes.

## Delivery rules

- Branch per PR, **stacked** in order. **Never on `main`. Phil merges.**
- Actions-only for build/deploy. Locally: `just check`, `just test`, `just dev`.
- `gh pr view --json state,mergedAt` before every push, not just once.
- No copy changes; flagged placeholders only if unavoidable.
- **Every PR verified in light AND dark, at 375px AND desktop.**
- **Every PR states the routes it affects**, so the local pass is a checklist rather than a
  memory test. This matters from PR 5 on: extracting a house component fans out across routes
  that aren't the one being worked on — `Chip` spans 5, `Note` spans 6.
- **Every extraction deletes its copies in the same PR.** A component that ships beside the
  duplication it replaces has made things worse, not better.

## Sequence

| PR | Layer | What | Retires |
|---|---|---|---|
| 1 ✅ | L1 | Tokens | groundwork |
| 2 | L2+L3 | Fix `Split`; install interaction primitives; settle density | — |
| 3 | L2+L3 | **Explore shell + filter drawer** ← **gate** | #3 |
| 4 | L4 | `DenseRow`, adopted by `GameList` + `GameRow` + `whats-new` | #2, #4 |
| 5 | L4 | `Seg` `Chip` `Pager` `EmptyState` `SectionLabel` `Door` | #6 |
| 6 | — | Migrate remaining pages; residue | #1, #7, #8, #9 |
| 7 | L5 | Rewrite the skill to describe what exists | recurrence |

---

### PR 1 — Tokens ✅ *shipped (`2137504`)*

All 21 shadcn variables in both themes, plus `--tap-min` (44px), `--input-font-min` (16px), and
the breakpoint convention. 114 insertions, 0 deletions. `just check` clean, build verified.

**PR 1 fixes nothing on its own.** It defines tokens; each is applied later. #5 in particular
cannot be fixed globally — the four offending inputs compile to `input.s-xxx { font-size: … }`,
which outranks any bare `input` rule `app.css` could add. #9 is not fixed by a token either,
because a custom property cannot appear in a `@media` prelude; it is fixed by **deleting
queries**, which is L2's job.

---

### PR 2 — Foundation: fix `Split`, install L3, settle density

**Branch:** `feat/frontend-foundation` · **Files:** `layout/split.svelte`, `layout/tokens.ts`,
`package.json`, `components.json` (new), `src/lib/components/ui/*`

**a. Fix the layout primitives.** They are unproven code — zero imports, zero tests.

1. **Bug:** `at="sm"` is in `SplitAt` but no `.at-sm` rule exists; passing it silently leaves the
   region stacked forever. Add the rule. **Also fix upstream in `front-end-design/kit`** — every
   project seeded from that kit has the same dead prop.
2. **Missing capability:** add a fixed-length basis (e.g. `basis="16rem"`) alongside the
   percentage ratios. Explore's rail is fixed-width; `aside-narrow` would give it 38rem inside
   `Container size="wide"` and grow it with the window.
3. Add a later collapse threshold — 35rem is right for content-beside-content, wrong for a
   control rail beside a dense table (which needs ~56rem).
4. Audit `AutoGrid` and `Container` for the same class of unexercised defect before PR 3 leans
   on them.

**b. Install L3.**

5. **Verify compatibility first** — Svelte 5.56 / Tailwind 4.3 / Kit 2.63. If `@latest` doesn't
   support this cleanly, **stop and report**; don't pin something that half-works.
6. `pnpm add bits-ui @lucide/svelte`. **Nothing from `@tanstack/*`.**
7. **Guard `app.css` through `init`** — it rewrites the file. Back up, run, diff, restore every
   deliberate line: palette, comments, `.chart-area`, `@custom-variant dark`, PR 1's tokens.
8. `add sheet dialog tooltip popover button input checkbox collapsible separator scroll-area`.
   **Not `table`** (spec L3).

**c. Settle density (spec D5).** Put a shadcn `Button` and `Input` on screen next to the Rail
and decide: restyle shadcn down to the app's 0.66–0.85rem density, or bring the app up at narrow
widths only. This determines how `Button`'s size variants bind to `--tap-min`, so it cannot be
deferred past this PR. **Bring Phil the comparison rather than deciding alone.**

**Verify:** `just check` clean. Named imports resolve. `just dev` → **all pages render
identically** — this PR must be visually inert. Spot-check `AnalysisPanel`'s fullscreen dialog
(preflight's `margin: 0` on `dialog` broke it once). `git diff src/app.css` empty or additive.
Render `Split` in a scratch route at several widths — it has never been rendered.

---

### PR 3 — Explore shell + filter drawer ← **the gate**

**Branch:** `feat/explore-shell` · **Files:** `games/+page.svelte`. `Rail` gets a wrapper, not a
rewrite. `GameList`, `ShapeStrip`, `AnalysisPanel` untouched.

The first point mobile visibly works, and what `games/+page.svelte:380` already asks for:
*"A proper narrow layout wants the filters behind a drawer with the results first."*

1. Replace `grid-template-columns: 16rem minmax(0, 1fr)` with the fixed-basis `Split`. Preserve
   the two independently scrolling columns and `Container size="wide" fill`'s fill-height.
   **Preserve `.canvas`'s `container-type: inline-size`** — `GameList`'s column-shedding resolves
   against it and PR 4 builds on that.
2. Below the narrow threshold, the rail moves into a `Sheet` behind a Filters trigger, results
   first. Above it, the rail stays exactly where it is. `Rail` is *placed*, not rewritten.
3. Trigger shows the active-filter count — filters must be legible while hidden.
4. Delete the `@media (max-width: 900px)` block that stacks a 20rem filter box above results.
5. Otherwise **equivalence**: desktop Explore indistinguishable from `main`.

**Verify:** 375px — results first, drawer opens/closes, filters apply, count correct, no
horizontal scroll. Desktop — side by side against `main`: rail, scope, sort, paging, universe
switch, List/Visualize, row → detail. Both themes. Record the real cost.

---

## Gate — stop here

Phil reviews Explore locally at phone width. Outcomes:

- **Continue** to PR 4+.
- **Adjust** — having seen it, change `DenseRow`'s narrow strategy or the drawer threshold.
- **Stop.** Two foundation PRs and one feature is a cheap answer if the system doesn't deliver.

Also decided here: migrate everything, or adopt-on-contact (spec open question 3).

---

### PR 4 — `DenseRow` *(post-gate)*

**Branch:** `feat/dense-row` · **Files:** new `DenseRow`; `GameList`, `GameRow`,
`discover/+page.svelte` (its `.collhead` mirrors `GameRow`'s template and must move in step),
`whats-new/+page.svelte`

**Defects #2 and #4 are the same defect in two files.** One component, one narrow strategy.

1. Extract the anchor-on-a-grid row (spec D2 — rows stay `<a>`, never `<tr>`).
2. Give it **one** defined narrow behaviour — shed further, horizontal scroll with a pinned name
   column, or stack into a card row. **Decide from PR 3 at 375px**, not on paper.
3. Fix the clipping defect: `.listwrap { overflow: hidden }` makes overflowing columns
   unreachable rather than scrollable.
4. Both lists must fit 335px with nothing clipped (`GameList` is ~585px today, `GameRow` ~388px).
5. Preserve the encodings — `Gauge`, `ComplexityMeter`, `PlayerPips`, the two-line name cell.
6. **Delete all three copies.**

---

### PR 5 — The rest of L4 *(post-gate)* — **one component per PR**

Each extracted from the copies that exist, tap- and touch-correct **once**, every copy deleted
in the same PR. Split one-per-PR because each fans out across routes that aren't the one being
worked on, and the review is a per-route walk:

| PR | Component | Copies | Routes to check |
|---|---|---|---|
| 5a | `Seg` | 6 | Explore, game detail, whats-new — retires #6 in one place, not six |
| 5b | `Chip` | 7 | Explore, Discover, landing, game detail, dev/similar |
| 5c | `EmptyState` | 5 | Explore, game detail, whats-new, dev/similar |
| 5d | `Pager` | 3 | Explore, whats-new |
| 5e | `SectionLabel` (`.lbl`/`.note`) | 4–8 | Explore, landing, about, settings, dev/similar |
| 5f | `Door` | 2 | landing, Discover |

Take them in that order — `Seg` first because it carries a defect (#6), `Door` last because it
is two files and cosmetic.

---

### PR 6 — Migrate + residue *(post-gate)*

Discover, whats-new, game detail, landing onto the proven components. Plus: app bar and footer
(#1), touch tooltips (#7 — `StackedColumns:149`, `MiniColumns:82`, `VizOfTheDay:850`), `dvh`
(#8), and deleting media queries the primitives made redundant (#9).

---

### PR 7 — Codify *(post-gate)*

Rewrite `frontend-patterns` to describe **what exists**: the five layers, the compose-primitives
rule, `@container` over `@media`, the DuckDB-WASM data pattern with TanStack Query explicitly
excluded, rows-are-anchors, the tap and input floors.

**This is what stops the problem recurring** — it began because a skill described a system nobody
had installed. Also: delete `src/lib/query/keys.ts`, resolve `app.d.ts`'s unused
`breadcrumbs?`/`subtitle?`, and push the verified `front-end-design` correction.

## Out of scope

TanStack anything. Porting `Scatter.svelte` to LayerChart. Any data-layer change. Deployment.

## Open questions

1. **Density (D5)** — decided in PR 2, with a component on screen.
2. **`DenseRow`'s narrow behaviour** — decided at the gate, at 375px.
3. **Migration breadth** — decided at the gate.
4. If `shadcn-svelte@latest` doesn't support this stack cleanly — PR 2 assumes **stop and report**.
