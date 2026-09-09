# BGG Viewer — Front-End Design System — Design

**Date:** 2026-09-09
**Status:** Draft for review (rewritten 2026-09-09 — reframed from "adopt a library" to "build the system")
**Builds on:** [2026-07-28-client-catalog-architecture-design.md](2026-07-28-client-catalog-architecture-design.md)
— that spec settles the data layer, and is why half of the source kit does not apply here.

> Copy note: no user-facing copy changes. Any strings introduced are **placeholder** — Phil
> writes the final copy.

## Goal

**A front-end design system this app builds on from here** — one place per pattern, so future
work is standardized by default and **mobile-correct by construction** rather than by remembering.

Mobile is not a list of bugs to fix. It is a property the system has, or doesn't. The nine
defects in [Appendix A](#appendix-a--the-defect-inventory) are symptoms used to check the system
is real; they are not the deliverable.

### Success criteria

1. Every pattern in the app has **one** implementation. No pattern is copy-pasted across files.
2. A new page composes primitives and is mobile-correct **without the author thinking about it** —
   no hand-written `grid-template-columns`, no new breakpoint.
3. Explore works on a 375px screen: filters reachable, results readable, nothing clipped.
4. No horizontal page scroll at 375px on any migrated surface.
5. `just check` clean; light **and** dark verified on every change.
6. The `frontend-patterns` skill describes **what exists**, so the next agent builds on the
   system instead of around it.

## Why the app is in this state

Two causes that compound.

### Cause 1 — the component layer was never installed

The `frontend-patterns` skill (847 lines) accurately describes the `front-end-design` kit's
**post-scaffold** state. bgg-viewer ran part of that scaffold. Commit `db969c8` ("project
skeleton") copied the skills and layout primitives; the components never came — no `bits-ui`,
no `components.json`, no `shadcn-svelte init`.

So an agent loads the skill, writes `import { Card } from '$lib/components/ui/card'`, gets a
resolution error, and hand-writes scoped CSS. Repeated across the codebase that produced
**~15,800 lines of Svelte in 156 files with 422 scoped class names.**

But 422 class names is not 422 decisions. **It is roughly fifteen components, each written
between two and eight times:**

| Pattern | Files | Pattern | Files |
|---|---|---|---|
| `.note` | 8 | `.head` | 5 |
| `.chip` | 7 | `.empty` | 5 |
| `.row` | 7 | `.lbl` | 4 |
| `.seg` | 6 | `.pager` | 3 |
| `.bar` | 5 | `.door` | 2 |

And **the codebase knows.** The comments say so, in as many words:

> *"Matches Rail's Universe segmented control (`.seg`/`.seg button`) — the same visual language"*
> *"Lifted from the landing page's `.door`, **deliberately**: the same affordance in the same shape"*
> *"Position + pager, matching GameList.svelte's own `.bar` **exactly**"*
> *"Same pill shape as the game detail page's own `.chip`"*
> *"Same six-way split as GameRow's `.row`"*

That is a codebase keeping component copies in sync **by hand, through comments**, because it
has nowhere to put a component. That is the disease, and it is why mobile cannot be fixed page
by page: fixing tap targets means editing six copies of one control.

The hand-rolled CSS is not bad work — the reasoning in `GameList.svelte` and `tokens.ts` is
unusually careful. It is careful work done fifteen times.

### Cause 2 — half the source kit does not apply, and nobody wrote that down

bgg-viewer is a **local-database app**. The client-catalog spec is explicit:

> *"All catalog interaction is client-side SQL — filter, sort, paginate, aggregate, search,
> chart — sub-100ms over 38k rows, **zero server round-trips**, zero BQ cost."*

One ~3MB Parquet artifact loads once per day into DuckDB-WASM; every interaction is SQL against
it. **42 `query<T>()` call sites across 13 files.**

The kit's data layer assumes the opposite — TanStack Query caching *server responses*,
`$app/server` remote functions making *server round trips*, TanStack Table row models sorting
*in-memory JS arrays*. All three solve a problem this app spent a whole spec deciding not to
have. Nothing in the repo said so, which is how it nearly got adopted.

**Correcting this spec's own earlier draft:** `src/lib/query/keys.ts` and the absent
`@tanstack/svelte-query` were called fossils of the skipped scaffold. They are not. `keys.ts`
says *"detail now; list/facets in PR 5"* — the **MVP-era server-backed design**, which the
client-catalog spec explicitly *supersedes*. The app did not fail to install TanStack Query; it
outgrew the need. Delete `keys.ts`.

## The system

Five layers. Mobile-correctness lives in layers 2 and 4.

### Layer 1 · Tokens — *shipped*

Color, spacing, type, `--tap-min` (44px), `--input-font-min` (16px), and the breakpoint
convention. All 21 shadcn variables now defined in both themes.

Breakpoints are a **documented convention, not tokens** — a custom property cannot appear in a
`@media`/`@container` prelude, so a token there would read as enforced and wouldn't be. The
canonical set: `sm 35rem · md 40rem · lg 56rem · xl 80rem`.

### Layer 2 · Layout primitives — *exist, unused, unproven*

`Container` · `Stack` · `AutoGrid` · `Split`. The responsive skeleton, **mobile-correct by
construction**: `AutoGrid` is `repeat(auto-fit, minmax(min(100%, …), 1fr))`, `Split` is a
container query. Neither can overflow at any width.

> **The rule that makes this a system: pages compose primitives. Pages never write
> `grid-template-columns`.**

That rule retires most of the app's **12 media queries at 8 distinct widths** (40rem, 560, 640,
720, 860, 900, 1100, 1280px — note `40rem` and `640px` are the same width written two ways).
A query that does not exist cannot drift.

These are **unproven code**: imported by zero pages, covered by zero tests. Reading `Split`
(26 lines) found two problems:

- **A bug:** `at="sm"` is in the public type but no `.at-sm` rule exists — only `.at-md`, inside
  `@container (min-width: 35rem)`. Passing it silently leaves the region stacked forever. This
  should be fixed upstream in `front-end-design/kit` too.
- **A missing capability:** `SPLIT_BASIS` is percentage-only (`50%`/`34%`/`40%`). Explore's rail
  is a fixed `16rem`; inside `Container size="wide"` (112rem), `aside-narrow` resolves to
  **38rem — 2.4× the current rail**, and it *grows with the window*, which is backwards for a
  rail of fixed-width controls. Not a defect — `Split` was documented for *"record-detail
  headers and featured-vs-supporting regions"*, content beside content. A control rail is a use
  case it needs extending for.

Treat this layer as new code, not as foundation.

### Layer 3 · Interaction primitives — *buy, don't build*

From shadcn-svelte on `bits-ui`: `Sheet` · `Dialog` · `Tooltip` · `Popover` · `Button` ·
`Input` · `Checkbox` · `Collapsible`.

Chosen for **focus traps, scroll lock, ARIA and keyboard handling** — not for looks. This is the
layer where hand-rolling is genuinely a mistake, and Explore currently hand-rolls 10 `<details>`
and 6 `<dialog>`. `Sheet` in particular is the filter drawer `games/+page.svelte:380` already
asks for in a comment.

**Not installed:** `@tanstack/*` anything (Cause 2), and shadcn's `table` — it is styled
`<table>`/`<tr>`/`<td>`, and the table layout algorithm is rigid where a CSS grid reflows, so it
would make mobile *harder* while breaking `GameList`'s anchor rows (see D2).

### Layer 4 · House components — *extract from the copies that exist*

The app's own vocabulary. This is where the duplication table above gets retired, and where
mobile is solved **once per pattern**:

| Component | Copies | What it standardizes |
|---|---|---|
| `DenseRow` | 3 | **one** narrow strategy for `GameList` + `GameRow` + `whats-new` |
| `Seg` | 6 | tap targets, fixed once instead of six times |
| `Chip` | 7 | pill shape, link vs button, tap target |
| `Pager` + position bar | 3–5 | |
| `EmptyState` · `SectionLabel` · `Door` | 2–5 each | |

`DenseRow` is the important one: **defects #2 and #4 are the same defect in two files.** As a
component it is one fix with one defined narrow behaviour — standardization and mobile in a
single move.

### Layer 5 · Conventions — *codified in the skill*

Written into `frontend-patterns` so future work inherits them rather than rediscovering them:
compose primitives, never hand-write a grid template; `@container` over `@media`; the
DuckDB-WASM data pattern and the explicit exclusion of TanStack Query; rows are anchors, not
`<tr>` (D2); tap and input-font floors.

**This layer is what stops the whole problem recurring.** It began because a skill described a
system nobody had installed.

## Design decisions

### D1 — No TanStack, neither Query nor Table

**Query:** no per-interaction server fetch exists to cache. **Table:** forced into
`manualSorting` + `manualPagination` by the SQL-paging architecture, every row model is bypassed;
what remains is ~60 lines of config replacing the ~20 lines of runes `GameList.svelte:101-120`
already uses, plus cell rendering pushed into `renderComponent()` indirection, for zero new
behaviour.

Checked against all nine defects: **TanStack fixes zero of them.**

### D2 — `GameList`'s rows stay anchors on a grid

`GameList.svelte:253` rows are real `<a href="/games/{id}">`, stated as deliberate in its header
comment. `<tr>` + onclick loses middle-click, cmd-click, right-click-copy, and — functionally —
SvelteKit's `data-sveltekit-preload-data="hover"`, which resolves anchor `href`s.
`+layout.svelte:20-30` explicitly depends on that preloading to cover the blocking warehouse
round-trip on game detail.

So `DenseRow` is an anchor-on-a-grid component. Its narrow behaviour is a grid-template decision,
not a component-library one.

### D3 — Build vertically on Explore, then migrate horizontally

**Explore contains every house pattern in the app** — `.seg` `.chip` `.bar` `.pager` `.empty`
`.lbl` `.row` `.head` `.note`, all nine, across its 12 components — plus 13 inputs, 10
`<details>`, 6 `<dialog>`, 40 buttons.

So Explore is not merely the hardest page. **It is the complete specimen.** Build the system
there and the system is finished by construction; every other page becomes a migration onto
components already proven in the hardest case.

The alternative — build all layers abstractly, adopt later — is exactly how `Split` ended up
with a dead prop nobody noticed. Rejected.

### D4 — Tokens before components *(done)*

Installing first would render every component half in the BGG palette and half in shadcn's slate
defaults, in both themes, silently. Shipped as PR 1.

### D5 — Density has to be decided when it can be seen

shadcn's defaults are more generous than this app's: dense surfaces here run 0.66–0.85rem type
with 0.1–0.3rem padding; shadcn defaults to `text-sm` with roomier padding and a ~40px button.
That is **good for mobile and loose next to the desktop density.**

Either shadcn components get restyled down, or the app's density comes up. Recommendation: come
up **at narrow widths only** — density is a desktop affordance. **Not decided here** — it needs a
component on screen next to the Rail. It determines how `Button`'s variants are configured, so
it gets decided in the foundation PR, not before.

### D6 — Rename Tailwind-colliding classes on contact

Tailwind's utility layer is global and beats a scoped rule for the same property — why
`Container` uses `.measured`. Two collide today: `.grid` (`GameCards`, `Scatter:671`,
`VizOfTheDay:768`, `dev/similar:2035`) and `.card` (`GameCards:133`, `PredictionPanel:243`,
`games/[id]:757`).

## Scope

**In:** all five layers; Explore rebuilt on them; the remaining pages migrated; deleting
`src/lib/query/keys.ts`; rewriting the skill.

**Out:** TanStack anything. Porting `Scatter.svelte` (696 lines, custom canvas hit-testing) to
LayerChart. Any data-layer change. Deployment. `front-end-design` corrections — deferred until
this repo has run it and knows what actually breaks, except the `Split at="sm"` bug which is a
clean upstream fix.

## Risks

- **`shadcn-svelte init` rewrites `app.css`**, which carries a deliberate, heavily-commented
  palette. Back up, run, diff, restore by hand.
- **Version compatibility** — Svelte 5.56 / Tailwind 4.3 / Kit 2.63. Confirm before relying on
  `@latest`; **stop and report** rather than pinning something that half-works.
- **Tailwind preflight** — already bitten once: `margin: 0` on `dialog` broke `AnalysisPanel`.
- **No visual-regression safety net.** `just test` covers logic only; every check in the plan is
  "look at it in both themes." Workable for a reviewed sequence; it does not scale to a sweep.
- **Explore is the most important page.** Mitigated by branch + local review + Phil merges.
- **Scope.** This is a system, not a patch. The gate exists so it can be stopped.

**Rollback:** all work on branches; the install is additive; unmigrated pages keep working.

## Delivery

Branch per PR, stacked, one concern each. **Never on `main`; Phil merges.** Actions-only for
build/deploy; locally `just check`, `just test`, `just dev`. Check
`gh pr view --json state,mergedAt` before every push.

## Open questions

1. D5 — density: restyle shadcn down, or bring the app up at narrow widths? Decide with a
   component on screen.
2. `DenseRow`'s narrow behaviour — shed further, horizontal scroll with a pinned name column, or
   stack into a card row? Decide at 375px, not on paper.
3. After the gate: migrate everything, or adopt-on-contact?

---

## Appendix A — the defect inventory

Measured at 375px; `.content` padding leaves **335px ≈ 21rem** usable. The right-hand column is
the point: each defect belongs to a layer, and most of them stop being possible once that layer
exists.

| # | Defect | Location | Retired by |
|---|---|---|---|
| 1 | App bar is one `flex` row, no wrap, no hamburger; email/Settings/Log out/toggle overflow. Footer identical. | `+layout.svelte:106`, `:175` | L2 + L3 (`Sheet`) |
| 2 | Games list needs **~585px** against 335px, and `.listwrap { overflow: hidden }` **clips** it — columns unreachable | `GameList.svelte:416` | **L4 `DenseRow`** |
| 3 | Explore is `16rem minmax(0,1fr)` with one 900px fallback stacking a 20rem filter box *above* results | `games/+page.svelte:282`, `:380` | **L2 `Split`** + **L3 `Sheet`** |
| 4 | Discover row bottoms out at **388px**, still too wide; no step below 34rem | `GameRow.svelte:124` | **L4 `DenseRow`** (same defect as #2) |
| 5 | Inputs at 0.82–0.9rem trigger iOS auto-zoom on focus, which persists | `Rail`, `EntityFilter:95`, `GameSearch:83` | L1 + L3 (`Input`) |
| 6 | Tap targets ~17–24px against 44px | `ShapeStrip`/`Rail` `.seg button` | **L4 `Seg`** (once, not 6×) |
| 7 | Tooltips on `onmouseenter`/`:hover` — unreachable on touch | `StackedColumns:149`, `MiniColumns:82`, `VizOfTheDay:850` | L3 (`Tooltip`) |
| 8 | `100vh`/`100vw` fullscreen; on mobile `vh` is the *large* viewport | `AnalysisPanel:686` | one line (`dvh`) |
| 9 | 12 media queries at 8 widths; nothing mobile-first; `ShapeStrip:114` uses `window.matchMedia` while siblings use container queries | app-wide | **L2** — by deleting queries |

**None of the nine is addressed by TanStack.** Seven need no new dependency; only #3 and #7
genuinely do.
