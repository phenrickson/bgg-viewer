# BGG Viewer — Front-End Standardization & Mobile — Design

**Date:** 2026-09-09
**Status:** Draft for review (rewritten 2026-09-09 after the data-layer finding)
**Source kit:** `front-end-design` — `basecamp-rebuild-kit.md` §2/§6, plus `skills/frontend-patterns`
**Builds on:** [2026-07-28-client-catalog-architecture-design.md](2026-07-28-client-catalog-architecture-design.md)
— that spec settles the data layer, and is the reason half of the source kit does not apply here.

> Copy note: no user-facing copy changes. Any strings introduced during the refactor are
> **placeholder** — Phil writes the final copy.

## Why

The front end is not usable on a phone, which is strange for an app that ships a documented
component system. Two causes, and they compound.

### Cause 1 — the component layer was never installed

The `frontend-patterns` skill (847 lines) accurately describes the `front-end-design` kit's
**post-scaffold** state. bgg-viewer ran only part of that scaffold. Commit `db969c8`
("project skeleton") copied the skills and the layout primitives; the components never came.

| Kit step | Status |
|---|---|
| §2 styling — `clsx`, `tailwind-merge`, `tailwind-variants`, `tw-animate-css` | ran |
| §2 component primitives — `bits-ui`, `@lucide/svelte` | **skipped** |
| §2 forms — `sveltekit-superforms`, `formsnap`, `zod` | ran |
| §5 layout primitives + `cn.ts` | ran |
| §6 `shadcn-svelte init` + `add` | **never ran** — no `components.json` |

An agent then loads the skill, writes `import { Card } from '$lib/components/ui/card'`, gets a
resolution error, and hand-writes scoped CSS instead. Repeated across the codebase that
produced **~15,800 lines of Svelte in 156 files with 422 distinct scoped class names**, and:

- **`AutoGrid` and `Split` imported by zero pages** — the two primitives that cannot overflow
  by construction. `Stack` appears in 3 files; `Container` is used only as a `max-width` cap.
- **`.chart-area` used zero times.**
- **Nine layout media queries at five arbitrary widths** (560/640/860/900/1280px), nothing
  mobile-first, and `ShapeStrip.svelte:114` reading `window.matchMedia` in JS while its
  siblings use container queries.

The hand-rolled CSS is not bad work — the reasoning in `GameList.svelte` and `tokens.ts` is
unusually careful. The problem is that it is 156 *independent* decisions rather than one
system, which is exactly why mobile cannot be fixed page by page.

### Cause 2 — half the kit does not apply here, and nobody had written that down

bgg-viewer is a **local-database app**. The client-catalog spec is explicit:

> *"All catalog interaction is client-side SQL — filter, sort, paginate, aggregate, search,
> chart — sub-100ms over 38k rows, **zero server round-trips**, zero BQ cost."*

One ~3MB Parquet artifact loads once per day into DuckDB-WASM; every interaction is SQL against
that local database. **42 `query<T>()` call sites across 13 files.** The server is deliberately
thin so it scales to zero.

The source kit's data layer assumes the opposite — TanStack Query (`createQuery`, `staleTime`,
`gcTime`) caching *server responses*, `$app/server` remote query functions making *server round
trips*, TanStack Table row models sorting *in-memory JS arrays*. All three solve a problem this
app spent a whole spec deciding not to have.

**Correcting an earlier reading in this spec's own first draft:** `src/lib/query/keys.ts` and the
absent `@tanstack/svelte-query` were called fossils of the skipped scaffold. They are not.
`keys.ts` says *"detail now; list/facets in PR 5"* — that is the **MVP-era server-backed design**,
which the client-catalog spec explicitly *supersedes*. The app did not fail to install TanStack
Query; it outgrew the need. `keys.ts` should be **deleted**, not wired up.

## Goal

Standardize the front end on the parts of the kit that fit this architecture, and use that
standardization to make the app work on a phone.

Mobile is **the goal, not a follow-up**. An earlier draft deferred it on the theory that it
would fall out of a component migration. Once TanStack is out of scope, "standardize the
components" and "make mobile work" stop being sequential and become the same project.

### Success criteria

1. `components.json` exists; the presentation components resolve from `$lib/components/ui/*`.
2. All 21 shadcn token variables defined in `app.css` in the app's own oklch palette, both themes.
3. Explore is usable on a 375px screen: filters reachable, results readable, no clipped columns.
4. No horizontal page scroll at 375px on any migrated surface.
5. `just check` clean; light **and** dark verified on every change.
6. The skill states this app's data pattern explicitly, so no future agent reaches for TanStack
   Query against a local DuckDB.

## The decision: adopt the presentation half, skip the data half

### D1 — No TanStack. Neither Query nor Table.

**Query:** no per-interaction server fetch exists to cache.

**Table:** run headless with `manualSorting` + `manualPagination` — which this architecture
forces — and every row model is bypassed. What remains is column definitions and sort state,
against the ~20 lines of runes `GameList.svelte:101-120` already uses. It would mean ~60 lines
of table config, cell rendering pushed from direct markup into `renderComponent()` indirection,
and **zero** new behaviour. Worse, not neutral.

**shadcn's `table` component is also out**, for a reason that matters more than the above: it is
styled `<table>`/`<tr>`/`<td>`, and the table layout algorithm is rigid. Reflowing a `<table>`
row into a stacked card at narrow widths means `display: block` overrides fighting the table's
own layout. The CSS grid `GameList` uses today is the **more** mobile-friendly structure.
Converting would also break its anchor rows (see D2) while making the mobile problem harder.

### D2 — `GameList`'s rows stay anchors on a grid

`GameList.svelte:253` rows are real `<a href="/games/{id}">`, which its header comment states as
a deliberate choice. Moving to `<tr>` + onclick loses middle-click, cmd-click, right-click-copy,
and — functionally — SvelteKit's `data-sveltekit-preload-data="hover"`, which resolves anchor
`href`s. `+layout.svelte:20-30` explicitly depends on that preloading to cover the blocking
warehouse round-trip on game detail; without it, every row click waits with nothing on screen.

Consequence: `GameList`'s narrow-width problem is a **CSS grid-template strategy** problem, not
a component-adoption problem. Cheaper than a migration, and shared with `GameRow`.

### D3 — TanStack fixes none of the mobile defects

Checked one by one; the table is in [Appendix A](#appendix-a--the-mobile-defect-inventory).
**Zero of nine.** What fixes mobile is the layout primitives, the design tokens, and a small set
of *interaction* components. This is the evidence for D1.

### D4 — What to install

**Install:** `card` · `button` · `badge` · `input` · `sheet` · `tooltip` · `dialog` ·
`checkbox` · `separator` · `scroll-area`, on `bits-ui` + `@lucide/svelte`.

**Do not install:** `@tanstack/table-core`, `@tanstack/svelte-query`, `@tanstack/svelte-virtual`,
shadcn `table`, `svelte-sonner`.

`Sheet` is the highest-value single component: it is the filter drawer that
`games/+page.svelte:380` already asks for in a comment — *"A proper narrow layout wants the
filters behind a drawer with the results first; this keeps them both in reach until that
exists."*

### D5 — Tokens before components

shadcn components reference 21 CSS variables; `app.css` defines 10. Missing: `--popover(-foreground)`,
`--secondary(-foreground)`, `--accent(-foreground)`, `--destructive(-foreground)`, `--input`,
`--sidebar*`. Installing first means every component appears half-BGG-palette, half-slate, in
both themes, and gets re-themed twice.

The token pass also carries the mobile primitives that have no component: a **16px input
font-size floor** (defect #5), **tap-target minimums** (#6), and **named breakpoints** to replace
the five arbitrary widths (#9).

`--destructive` should resolve to the existing `--color-negative` rather than introduce a second
red. `--vote-*` and `--color-positive`/`--color-negative` stay as the app-specific layer they are.

### D6 — Class-name collisions get renamed on contact

Tailwind's utility layer is global and beats a component's scoped rule for the same property —
already documented in-repo, and why `Container` uses `.measured` not `.container`. Of 422 scoped
class names, two collide today: `.grid` (`GameCards`, `Scatter:671`, `VizOfTheDay:768`,
`dev/similar:2035`) and `.card` (`GameCards:133`, `PredictionPanel:243`, `games/[id]:757`).
Rename on any file being touched, not as a sweep.

## Scope

**In:** the install above; the tokens; Explore's workspace shell on `Split`; the filter drawer
via `Sheet`; the dense-row responsive strategy shared by `GameList`/`GameRow`; app bar, tooltips
and `dvh` fixes; deleting `src/lib/query/keys.ts`; a data-pattern section in the skill.

**Out:** TanStack anything. Migrating all 156 files. Porting `Scatter.svelte` (696 lines, custom
canvas hit-testing) to LayerChart. Any change to the data layer itself. Deployment.
`front-end-design` corrections — deferred until this repo has run the install and knows what
actually breaks (see Delivery).

## Risks

- **`shadcn-svelte init` rewrites `app.css`**, which carries a deliberate, heavily-commented
  palette (~25 lines of argument on `--vote-*` alone). Back up, run, diff, restore by hand.
- **Version compatibility.** Svelte 5.56 / Tailwind 4.3 / Kit 2.63. Confirm before relying on
  `@latest`; **stop and report** rather than pinning something that half-works.
- **Tailwind preflight.** Already bitten once — preflight's `margin: 0` on `dialog` broke
  `AnalysisPanel`'s centering. More components, more of this.
- **Explore is the app's most important page.** Mitigated by branch + local review + Phil merges.

**Rollback:** all work on a branch. The install is additive; unmigrated pages keep working, so
the branch can be abandoned wholesale.

## Delivery

Branch per PR, stacked, one concern each. **Never on `main`; Phil merges.** Build/deploy stays
Actions-only — locally nothing beyond `just check`, `just test`, `just dev`. Check
`gh pr view --json state,mergedAt` before every push, not just once.

**Pilot-first, upstream-last.** bgg-viewer is not being re-seeded from the kit, so nothing
downstream waits on the upstream fix — and writing an upstream guardrail before running the
install here means guessing at what breaks. Run it, learn, then push a verified correction.

## Open questions

1. After the Explore pilot: finish Explore, sweep the app, or adopt-on-contact? Deliberately
   unanswered — it is the gate's decision.
2. Does the dense-row narrow strategy shed columns further, scroll horizontally with a pinned
   name column, or become a stacked card row? Needs to be seen at 375px before deciding.

---

## Appendix A — the mobile defect inventory

Measured statically at 375px; `.content` padding leaves **335px ≈ 21rem** usable. This is now
the work list, not deferred evidence. The right-hand column is the D3 evidence.

| # | Defect | Location | Fixed by |
|---|---|---|---|
| 1 | App bar is one `flex` row, no wrap, no hamburger; only mobile rule hides search at 640px. Email, Settings, Log out, toggle all overflow. Footer identical. | `+layout.svelte:106`, `:175` | layout + `Sheet` |
| 2 | Games list needs **~36.5rem / 585px** against 335px, and `.listwrap { overflow: hidden }` **clips** the surplus — columns unreachable | `GameList.svelte:416` | grid-template strategy |
| 3 | Explore is `16rem minmax(0,1fr)` with one 900px fallback stacking a 20rem filter box *above* results | `games/+page.svelte:282`, `:380` | **`Split`** + **`Sheet`** |
| 4 | Discover row bottoms out at **24.25rem / 388px**, still too wide; no step below 34rem | `GameRow.svelte:124` | grid-template strategy |
| 5 | Inputs at 0.82–0.9rem trigger iOS Safari auto-zoom on focus, and it persists | `Rail`, `EntityFilter:95`, `GameSearch:83` | **token** (16px floor) |
| 6 | Tap targets ~17–24px against a 44px guideline | `ShapeStrip` `.seg button`, `Rail` `.seg button` | **`Button`** variants |
| 7 | Tooltips on `onmouseenter`/`onmouseleave` or CSS `:hover` — unreachable on touch | `StackedColumns:149`, `MiniColumns:82`, `VizOfTheDay:850` | **`Tooltip`/`Popover`** |
| 8 | Fullscreen uses `100vh`/`100vw`; on mobile `vh` is the *large* viewport, so the bottom hides under the URL bar | `AnalysisPanel:686` | `dvh` (one line) |
| 9 | 9 media + 5 container queries at 5 arbitrary widths; nothing mobile-first; `ShapeStrip:114` uses `window.matchMedia` while siblings use container queries | app-wide | **tokens + primitives** |

**None of the nine is addressed by TanStack.**
