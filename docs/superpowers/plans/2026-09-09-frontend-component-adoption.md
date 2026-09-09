# BGG Viewer — Front-End Component Adoption — Plan

**Date:** 2026-09-09
**Spec:** [2026-09-09-frontend-component-adoption-design.md](../specs/2026-09-09-frontend-component-adoption-design.md)
**Status:** Awaiting approval

## Goal

Get **Explore** (`/games`) running locally on real `shadcn-svelte` components so Phil can review
it and decide the scope of everything after. Three PRs to the gate; nothing past the gate is
planned.

**Success:** `just dev`, open `/games`, and the workspace and games list behave as they do today
— in both themes, at every width — but built from `$lib/components/ui/*` and the layout
primitives instead of hand-written grid templates. `just check` clean throughout.

### Why Explore and not a small page *(revised — Phil, 2026-09-09)*

The first draft of this plan piloted on `/whats-new` on "lowest risk" grounds. That was wrong.
A pilot exists to **de-risk**, and you de-risk by attacking the hardest case first. `/whats-new`
is a page where the hand-rolled version already works fine: it loads its whole result set and
sorts in the browser, which is exactly the skill's Pattern B. Migrating it would have proved
almost nothing, produced a misleadingly cheap cost estimate for the gate, and left us hitting
the real wall on Explore *after* committing.

Explore is also the product thesis — querying games as a set — and the page carrying nearly
every defect in the spec's Appendix A.

Sizing it honestly: **~4,519 lines across 13 components.**

| Component | Lines |
|---|---|
| `AnalysisPanel.svelte` | 808 |
| `Rail.svelte` | 641 |
| `views/GameList.svelte` | 634 |
| `views/ShapeStrip.svelte` | 505 |
| `games/+page.svelte` | 396 |
| `YearFilter` · `FacetList` · `RangeSlider` · `AdminCollectionPicker` · `ComplexityBands` · `FilterChips` · `EntityFilter` · `GameSearch` | 1,312 |

That is the whole project, not a pilot. So **Explore is the pilot page, and PR 3 migrates the
slice that carries the risk** — the workspace shell plus the games list. The rail, shape strip
and analysis panel follow *after* the gate. Phil reviews Explore with the new list running
beside the not-yet-migrated rail, which makes old and new directly comparable on one screen.

### Two findings Explore surfaced immediately

Both were invisible from `/whats-new`, and both are exactly what the pilot is for.

**F1 — `GameList` is deliberately not a table.** Its own header comment says so: *"Deliberately
a list of links laid out on a grid, not a `<table>`."* Rows are real `<a href="/games/{id}">`
anchors. Moving them to shadcn `Table.*` means `<tr>` plus an onclick, which **loses**
middle-click and cmd-click to open in a new tab, right-click → copy link, the status-bar URL
preview, and — functionally significant — `data-sveltekit-preload-data="hover"` preloading,
which `+layout.svelte` explicitly depends on for its loading-bar timing. Treat as a regression,
not a detail.

**F2 — the skill's DataTable patterns don't fit.** Both Pattern A and Pattern B assume the whole
result set is in memory. `GameList` pages against DuckDB with SQL `ORDER BY … LIMIT 100 OFFSET n`
(`GameList.svelte:130-155`), so only 100 rows of N ever exist client-side. TanStack's
`getSortedRowModel`/`getPaginationRowModel` are the wrong tools here; it needs
`manualSorting`/`manualPagination`. Doable, but **it is not what the skill documents**, and the
skill will need a third pattern written from whatever PR 3 lands on.

Neither finding is a reason to stop. Both are reasons Phil was right about the pilot page.

## Delivery rules

- Branch per PR, **stacked** in order (each builds on the last). **Never on `main`.**
- **Phil merges every PR.** Never `gh pr merge`.
- Build/deploy is **Actions-only** — locally, nothing beyond `just check`, `just test`, `just dev`.
- Check `gh pr view --json state,mergedAt` before every push to a branch, not just once.
- All user-facing strings stay as they are. No copy changes.

## Steps

---

### PR 1 — The eleven missing design tokens

**Branch:** `feat/shadcn-design-tokens` (off `main`)

`shadcn-svelte` components reference 21 CSS variables; `app.css` defines 10. Author the missing
eleven **before** any component exists to consume them, so no component is ever seen in shadcn's
slate defaults and nothing gets themed twice.

**Files:** `src/app.css` only.

**Work:**

1. Add to `:root` and `.dark`, in oklch, consistent with the existing warm-orange palette:
   `--popover` `--popover-foreground` `--secondary` `--secondary-foreground` `--accent`
   `--accent-foreground` `--destructive` `--destructive-foreground` `--input`, plus the
   `--sidebar*` set.
2. **Reconcile, don't duplicate.** `--destructive` should resolve to the same value as the
   existing `--color-negative` rather than introducing a second red. Leave `--vote-*` and
   `--color-positive`/`--color-negative` as the app-specific layer they already are (spec open
   question 2 — flagging the recommendation, not pre-deciding it).
3. Extend the `@theme inline` block so the new tokens map to Tailwind utilities the same way the
   existing ten do.
4. Preserve every existing comment in `app.css`. The `--vote-*` reasoning is ~25 lines of real
   argument and must survive.

**Verification:**
- `just check` clean.
- `just dev` → every page renders **identically** to before in both themes. Nothing consumes the
  new tokens yet, so any visual change at all means something was overwritten.
- `git diff` shows additions only — no modified or deleted existing token lines.

**Risk:** low. Purely additive; trivially revertible.

---

### PR 2 — Install the component layer

**Branch:** `chore/shadcn-svelte-install` (off PR 1)

Run the scaffold step this repo skipped — kit §2 component blocks and §6.

**Files:** `package.json`, `pnpm-lock.yaml`, `components.json` (new),
`src/lib/components/ui/*` (new dirs alongside the existing `layout/`).

**Work:**

1. **Verify compatibility first — do not assume.** Repo is Svelte 5.56 / Tailwind 4.3 / Kit 2.63.
   Confirm the `shadcn-svelte` version that actually supports this combination before installing.
   If `@latest` doesn't, stop and report rather than pinning something that half-works.
2. Install the skipped deps: `bits-ui`, `@lucide/svelte`, `@tanstack/table-core`. Defer
   `@tanstack/svelte-query`, `@tanstack/svelte-virtual`, `svelte-sonner` — the pilot slice needs
   none of them, and unused deps are how the last fossils got made (`src/lib/query/keys.ts`).
3. **Guard `app.css` through `init`.** Init rewrites it. Back it up first, run init, then diff and
   restore every deliberate line it clobbered — the palette, the comments, `.chart-area`, the
   `@custom-variant dark` rule.
4. `add` only what the pilot slice needs: `card`, `button`, `badge`, `table`, `input`,
   `scroll-area`, `separator`. The rail's controls (`checkbox`, `slider`, `collapsible`,
   `command`, `dialog`, `tooltip`, `sheet`) wait for the post-gate PRs that use them.
5. Confirm `components.json` paths point at `$lib/components/ui` and don't disturb `layout/`.

**Verification:**
- `just check` clean.
- Every import named by the `frontend-patterns` skill for these components resolves.
- `just dev` → **all pages still render identically**, both themes. No page consumes the new
  components yet, so this PR must be visually inert. If anything moved, preflight or `init`
  touched something it shouldn't have.
- `git diff src/app.css` is empty, or contains only intentional additions.

**Risks:**
- `init` clobbering `app.css` — mitigated by step 3, which is the whole reason it's a step.
- Tailwind preflight regressions elsewhere (already bitten once: preflight's `margin: 0` on
  `dialog` broke `AnalysisPanel` centering). The "all pages render identically" check is what
  catches this — spot-check `AnalysisPanel`'s fullscreen dialog specifically.

---

### PR 3 — Pilot: Explore's workspace shell + games list ← **the review gate**

**Branch:** `refactor/explore-workspace-components` (off PR 2)

**Files:** `src/routes/(app)/games/+page.svelte`, `src/lib/catalog/views/GameList.svelte`.
Rail, ShapeStrip, AnalysisPanel and the filter controls are **untouched** in this PR.

**Why this slice:** it answers both risky questions at once — can `Split` replace the
hand-rolled two-pane workspace, and can the component table carry the densest list in the app.
The two must move together regardless: `.canvas` owns the `container-type: inline-size` that
`GameList`'s `@container (max-width: 62rem)` column-shedding resolves against, so changing the
shell changes the list's breakpoint context.

**Work:**

1. **Workspace shell** — replace `grid-template-columns: 16rem minmax(0, 1fr)` with `Split`
   (`ratio="aside-narrow"`, container-query based). Preserve the two independently scrolling
   columns and the fill-height behaviour that `Container size="wide" fill` provides. Preserve
   the container-query context `GameList` depends on.
2. **Games list** — `Table.*` for chrome, `@tanstack/table-core` with **`manualSorting` and
   `manualPagination`** (F2): sorting stays in SQL, the table core never sees more than the
   current 100 rows. Do **not** reach for `getSortedRowModel`/`getPaginationRowModel`.
3. **Resolve F1 explicitly.** Rows must stay real links. Either keep `<a>` rows and use
   `Table.*` for chrome only, or verify `<tr>` + nested anchor preserves middle-click,
   cmd-click, right-click-copy and `preload-data="hover"`. **If neither works, stop and report
   — that is a gate finding, not something to paper over.**
4. Preserve the three visual encodings (`Gauge`, `ComplexityMeter`, `PlayerPips`) and the
   two-line row. They are the reason it isn't a plain table.
5. Fix the clipping bug on the way through (Appendix A #2): `.listwrap { overflow: hidden }`
   currently makes overflowing columns unreachable rather than scrollable. This is the one
   behaviour change permitted in this PR, because the current behaviour is a defect.
6. Rename any Tailwind-colliding scoped class in these two files.
7. Otherwise **equivalence only**. If a component can't reproduce something the hand-rolled
   version did, that is a **finding for the gate**, not licence to redesign Explore.

**Verification:**
- `just check` clean; `just test` passing.
- `just dev` → `/games` side by side against `main`: filtering via the (unmigrated) rail still
  drives the list, sort by every column, paging, the upcoming universe's `.pred` grid variant,
  row → detail navigation, empty state.
- **Link semantics explicitly:** middle-click and cmd-click a row open a new tab; hover
  preloading still fires.
- **Both themes.** Never ship one.
- Width sweep — and state honestly whether the 585px minimum improved, since that is the
  premise being tested.
- Record the real cost: time, lines removed vs added, and every place a component could not do
  what the hand-rolled version did. That list is the main input to the scope decision.

**Risks:**
- **F1/F2 are unresolved going in.** Either could turn out to be a blocker. That is the point of
  piloting here.
- Scope creep — Explore has 11 more components sitting right there. They are out of scope.
- Regression on the app's most important page. Mitigated by it being a branch, reviewed
  locally, merged only by Phil.

---

## Gate — stop here

Phil reviews Explore running locally and decides. Legitimate outcomes:

- **Finish Explore** — Rail, ShapeStrip, AnalysisPanel and the filter controls as further PRs.
- **Sweep the app**, now that the cost on the hardest page is known.
- **Carry on adopt-on-contact**, page by page as they're touched.
- **Stop.** If the components don't earn their keep on Explore, they won't anywhere, and three
  revertible PRs is a cheap answer to an expensive question.

Only after that: the migration scope chosen, a **third DataTable pattern** written into the
skill for SQL-paged lists (F2), reconciling the rest of `frontend-patterns` with what shipped,
resolving the `src/app.d.ts` and `src/lib/query/keys.ts` fossils, and the `front-end-design`
correction — written from what PRs 1–3 actually hit rather than guessed at.

## Out of scope

Mobile-specific work (filter drawer, touch targets, stacked rows, the `dvh` fix, hover-only
tooltips) — spec Appendix A, deferred to its own spec. Porting `Scatter.svelte` to LayerChart.
Any data-layer change. Deployment.

## Open questions

1. Fold `--vote-*`/`--color-positive`/`--color-negative` into shadcn's semantic set, or keep them
   as an independent app layer? PR 1 assumes **keep independent, map `--destructive` to
   `--color-negative`** — say if you'd rather they merge.
2. If `shadcn-svelte@latest` turns out not to support Svelte 5.56 / Tailwind 4.3 cleanly — stop
   and report, or pin an older version and proceed? PR 2 assumes **stop and report**.
3. **F1 fallback.** If `Table.*` cannot preserve anchor-row semantics, the fallback is to keep
   `<a>` rows on the layout primitives and use the component library only for chrome. Is that an
   acceptable outcome, or would it mean the components aren't worth it for this list at all?
   PR 3 assumes it's acceptable and reports it as a finding.
