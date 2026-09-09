# BGG Viewer — Front-End Component Adoption — Design

**Date:** 2026-09-09
**Status:** Draft for review
**Source kit:** `front-end-design` — `basecamp-rebuild-kit.md` §2 (deps) and §6 (shadcn-svelte),
plus `skills/frontend-patterns`

> Copy note: no user-facing copy changes in this spec. Any strings introduced during the
> refactor are **placeholder** — Phil writes the final copy.

## Why

The front end does not use the component system its own skill documents. The
`frontend-patterns` skill (847 lines, `.claude/skills/`) is an accurate description of the
`front-end-design` kit's **post-scaffold** state, but bgg-viewer only ever ran part of that
scaffold. The component layer was skipped.

Audit against the kit's own steps:

| Kit step | Status in bgg-viewer |
|---|---|
| §2 styling — `clsx`, `tailwind-merge`, `tailwind-variants`, `tw-animate-css` | ran |
| §2 component primitives — `bits-ui`, `@lucide/svelte`, `svelte-sonner` | **skipped** (only `mode-watcher`) |
| §2 tables/charts — `@tanstack/table-core`, `@tanstack/svelte-virtual` | **skipped** (only `layerchart`, `d3-*`) |
| §2 client data — `@tanstack/svelte-query` | **skipped** |
| §2 forms — `sveltekit-superforms`, `formsnap`, `zod` | ran |
| §5 layout primitives + `cn.ts` | ran |
| §6 `shadcn-svelte init` + `add ...` | **never ran** — no `components.json` |

Every plain utility `pnpm add` landed; everything constituting the component layer did not.

### What that cost

An agent loads the skill, writes `import { Card } from '$lib/components/ui/card'`, gets a
module-resolution error, and falls back to hand-writing scoped CSS. Repeated across the
codebase, that produced:

- **~15,800 lines of Svelte across 156 files**, with **422 distinct scoped class names**.
- **`AutoGrid` and `Split` imported by zero pages**, despite both existing and both being
  incapable of overflowing. `Stack` appears in 3 files. `Container` is used only as a
  `max-width` cap.
- **`.chart-area` (defined in `app.css`) used zero times**; 5 of 7 charts hand-rolled in raw
  SVG/canvas rather than LayerChart.
- **Fossils of abandoned attempts**: `src/lib/query/keys.ts` (TanStack Query key factories,
  imported by nothing) and `breadcrumbs?`/`subtitle?` typed on `PageData` in `src/app.d.ts`,
  never populated or read — someone started the unified header, hit the missing components,
  and stopped at the type declaration.
- **A front end that is not usable on a phone** — see Appendix A. Every mobile defect traces
  to a hand-written `grid-template-columns` standing where a primitive belonged.

The hand-rolled CSS is not bad work — the reasoning in `GameList.svelte` and `tokens.ts` is
unusually careful. The problem is that it is 156 *independent* decisions rather than one
system, which is why mobile cannot be fixed page by page.

## Goal

Complete the scaffold that was skipped, adopt the resulting components in bgg-viewer, and
correct `front-end-design` so the same gap cannot recur in the next project seeded from it.

Mobile friendliness is the **motivating symptom, not the deliverable** — it largely falls out
of pages moving onto primitives that cannot overflow. Remaining mobile-specific work
(filter drawer, touch targets, row layout) is scoped in a follow-up spec.

### Success criteria

1. `components.json` exists; `shadcn-svelte` components resolve from `$lib/components/ui/*`.
2. The `frontend-patterns` skill is true of this repo — every import it names resolves.
3. All 21 shadcn token variables are defined in `app.css` in the app's own oklch palette, in
   both light and dark.
4. At least one non-trivial page is fully migrated and demonstrably equivalent in light and
   dark, with no visual regression.
5. `just check` clean; no new horizontal scroll at any width on migrated pages.
6. `front-end-design` gains whatever the audit shows is missing, so `just build` produces a
   project where the skill is true from commit one.

## Scope

**In:**
- Dependency + `shadcn-svelte` install (kit §2 component blocks, §6).
- The eleven missing design tokens, authored in the existing oklch palette.
- A pilot page migration to prove the approach.
- Class-name collision remediation on migrated surfaces.
- Corrections to `front-end-design` (kit and/or skill).

**Out (deliberately):**
- Mobile-specific redesign — filter drawer, stacked row layout, touch-target pass.
  Follow-up spec.
- Migrating all 156 files. This spec establishes the mechanism and proves it on one page;
  the sweep is planned separately once the cost per page is measured.
- Porting `Scatter.svelte` (696 lines, custom canvas hit-testing) to LayerChart — needs its
  own spike; see Risks.
- Any change to the data layer — client catalog (DuckDB-WASM/Arrow) and warehouse read API
  are untouched.
- Deployment. Local branch verification only; ship via PR, Actions-only as always.

## Design decisions

### D1 — Install the real library, don't rewrite the skill down

Considered: trimming the skill to describe only what exists. Rejected — it would codify the
hand-rolled status quo as the house style, leave `AutoGrid`/`Split` unused, and leave the
mobile problem structural. The kit already documents a working install; the cheaper and more
durable move is to run it.

### D2 — Tokens before components

`shadcn-svelte` components reference 21 CSS variables. `app.css` defines 10:

| Defined | Missing |
|---|---|
| `--background` `--foreground` `--card` `--card-foreground` `--primary` `--primary-foreground` `--muted` `--muted-foreground` `--border` `--ring` `--radius` | `--popover` `--popover-foreground` `--secondary` `--secondary-foreground` `--accent` `--accent-foreground` `--destructive` `--destructive-foreground` `--input` `--sidebar*` |

A bare `shadcn-svelte add` therefore yields components half-styled in the BGG palette and half
in shadcn's slate defaults, in **both** themes. The eleven missing tokens must be authored
first, in oklch, consistent with the existing warm-orange-primary palette — a design task, not
an install step. Doing it after adoption means re-theming everything twice.

Note `--destructive` has a near-equivalent already: `--color-negative`. The new tokens should
reconcile with the existing semantic set (`--color-positive`/`--color-negative`) and the
`--vote-*` ramp rather than duplicating them.

### D3 — Pilot on a small page before Explore

Migrate one low-risk page end to end before touching the workspace. `/whats-new` or `/about`
are the candidates: small, self-contained, already using `Stack`, and neither is load-bearing
for the product thesis. Explore (`/games`) is the densest surface and the one whose regression
would hurt most; it goes last, after the per-page cost is known.

### D4 — Class-name collisions are a real, bounded hazard

Tailwind's utility layer is global and wins over a component's scoped rule for the same
property — already documented in-repo in `Rail.svelte` and `ShapeStrip.svelte`, and the reason
`Container` uses `.measured` rather than `.container`. Of 422 scoped class names, two collide
with Tailwind utilities today:

- `.grid` — `GameCards.svelte:128`, `Scatter.svelte:671`, `VizOfTheDay.svelte:768`,
  `dev/similar/+page.svelte:2035`
- `.card` — `GameCards.svelte:133`, `PredictionPanel.svelte:243`, `games/[id]/+page.svelte:757`

Adoption increases utility usage in files that currently rely on scoped CSS, so these must be
renamed on any file being migrated. Two is tractable; the risk is that the number grows as
utilities spread, which argues for renaming on contact rather than a big-bang sweep.

### D5 — `Scatter` and the hand-rolled charts stay, for now

Five charts are raw SVG/canvas. `MiniHistogram` and `Scatter` already handle pointer events
and `touch-action` correctly and represent real, working interaction design. The skill's
"always LayerChart" rule is right in general, but porting `Scatter`'s canvas hit-testing is a
spike, not a checklist item. `.chart-area` adoption and the LayerChart port are tracked
separately.

## Affected surfaces

- `package.json`, `pnpm-lock.yaml`, `components.json` (new)
- `src/app.css` — the eleven tokens, both themes
- `src/lib/components/ui/*` — new shadcn components alongside existing `layout/`
- `src/app.d.ts` — either implement or delete the `breadcrumbs`/`subtitle` fossil
- `src/lib/query/keys.ts` — either wire to TanStack Query or delete
- The pilot page + its server load
- `.claude/skills/frontend-patterns/SKILL.md` — reconcile with reality post-install
- `front-end-design/` — kit and/or skill corrections (separate repo, separate PR)

## Risks / unknowns

- **shadcn-svelte version compatibility.** Repo is Svelte 5.56 / Tailwind 4.3 / Kit 2.63.
  The kit's `pnpm dlx shadcn-svelte@latest` must be confirmed against these before relying on
  it. **Verify first; do not assume.**
- **`shadcn-svelte init` overwrites `app.css`.** `app.css` carries a heavily commented,
  deliberate palette (the `--vote-*` ramp reasoning alone is ~25 lines). Init must not be
  allowed to clobber it — check what it rewrites, and reconcile by hand.
- **Tailwind preflight interactions.** Already bitten once: preflight's `margin: 0` on
  `dialog` broke `AnalysisPanel`'s centering. More components means more of this.
- **Two-repo drift.** If bgg-viewer diverges from `front-end-design` during the work, the
  correction pushed upstream may not match what actually shipped. Sequence upstream-first.
- **Scope creep into the full migration.** The pilot must be allowed to stop at one page.

**Rollback:** all work on a branch, verified locally. Nothing deploys until a PR merges; the
install is additive (new `$lib/components/ui/*` dirs) and existing pages keep working
unmigrated, so the branch can be abandoned without partial-state risk.

## Delivery

Branch-and-PR as always, one concern per PR, **never on `main`**, and **Phil merges**.
Build/deploy stays Actions-only — nothing runs locally beyond `just check` and `just dev`.

**Sequencing — pilot-first, not upstream-first.** *(revised 2026-09-09)*

This spec originally proposed correcting `front-end-design` first, so the fixed kit would be
what gets copied down. That reasoning does not hold here: bgg-viewer is **not** being re-seeded
from the kit, it is being fixed in place, so nothing downstream is waiting on the upstream fix.
Worse, writing an upstream guardrail before running the install here means guessing at what
actually breaks. Run it in bgg-viewer, learn, then push a **verified** correction upstream.

This also gets the pilot in front of Phil sooner, which is what the decision gate needs.

1. bgg-viewer — tokens (the eleven missing variables, both themes).
2. bgg-viewer — deps + `shadcn-svelte init`/`add`, `components.json`.
3. bgg-viewer — **pilot migration of `/whats-new`** → **review gate**.
4. *Everything below is planned only after the gate:* the migration scope Phil chooses,
   reconciling the skill, resolving the `app.d.ts` and `query/keys.ts` fossils, and the
   `front-end-design` correction informed by what steps 1–3 actually hit.

Verification per step: `just check` (svelte-check + types), `just dev` on localhost:5173 in
**both light and dark**, and a width sweep for horizontal overflow.

## Resolved questions

**Q2 — How far does adoption go? → Pilot, review locally, then decide.** *(Phil, 2026-09-09)*

The migration sweep is explicitly **not** committed to up front. One page is migrated, reviewed
running locally, and the scope of everything after is decided from what that review shows. This
makes the pilot a **decision gate**, not merely the first step of a predetermined sweep — the
legitimate outcomes include "carry on page by page", "sweep it all", and "this isn't worth it,
stop here."

Consequence for the plan: work is sequenced so the pilot is runnable and reviewable as early as
possible, and nothing after the gate is planned in detail until the gate is passed.

**Q1 — Pilot page? → `/whats-new`.**

It exercises a server load, a sortable paginated table, a chart, and a segmented toolbar, and it
already imports `Container`/`Stack` — so it covers most of the baseline component set. `/about`
is nearly pure prose and would prove almost nothing. `/whats-new` is not load-bearing for the
product thesis, so a regression there is cheap.

## Open questions

1. **`front-end-design` correction** — is the kit actually wrong, or was it simply not run?
   The audit suggests the latter, in which case the upstream fix may be a guardrail (a
   `just verify` that fails when the skill's imports don't resolve) rather than new content.
   **Note:** this reverses the "upstream-first" sequencing above — see the Delivery section.
2. **The `--vote-*` and `--color-positive`/`--color-negative` tokens** — fold into shadcn's
   semantic set, or keep as an independent app-specific layer?

## Next

Answer the open questions, then write the plan at
`docs/superpowers/plans/2026-09-09-frontend-component-adoption.md`.

---

## Appendix A — the mobile symptoms

Recorded here as evidence for the "one system, not 156 decisions" argument, and as input to
the follow-up mobile spec. Measured statically at a 375px viewport; `.content` padding
(`--space-lg` ×2) leaves **335px ≈ 21rem** usable.

| # | Symptom | Location |
|---|---|---|
| 1 | App bar is one `flex` row, no wrap, no hamburger; the only mobile rule in the header hides the search at 640px. Full user email, Settings, Log out, toggle all overflow. Footer identical. | `+layout.svelte:106`, `:175` |
| 2 | Explore table needs **~36.5rem / 585px** minimum against 335px available, and `.listwrap { overflow: hidden }` **clips** the surplus — columns vanish unreachably | `GameList.svelte:416` |
| 3 | Explore workspace is `16rem minmax(0,1fr)` with one 900px fallback that stacks a 20rem scrolling filter box *above* the results. The code comment already asks for a drawer. | `games/+page.svelte:282`, `:380` |
| 4 | Discover row bottoms out at **24.25rem / 388px**, still wider than available; no step below 34rem | `GameRow.svelte:124` |
| 5 | Inputs at 0.82–0.9rem trigger iOS Safari auto-zoom on focus and stay zoomed | `Rail.svelte`, `EntityFilter.svelte:95`, `GameSearch.svelte:83` |
| 6 | Tap targets ~17–24px against a 44px guideline | `ShapeStrip.svelte` `.seg button`, `Rail.svelte` `.seg button` |
| 7 | Tooltips driven by `onmouseenter`/`onmouseleave` or CSS `:hover` — unreachable on touch | `StackedColumns.svelte:149`, `MiniColumns.svelte:82`, `VizOfTheDay.svelte:850` |
| 8 | Fullscreen uses `100vh`/`100vw`; on mobile `vh` is the *large* viewport, so the bottom sits under the URL bar (`dvh` is the fix) | `AnalysisPanel.svelte:686` |
| 9 | 9 layout media queries + 5 container queries at 5 arbitrary values (560/640/860/900/1280px); nothing mobile-first; `ShapeStrip:114` reads `window.matchMedia` in JS while siblings use container queries, so the strip and the list disagree about how narrow they are | app-wide |

Items 2, 3, 4 and 9 are direct consequences of hand-written grid templates standing where
`AutoGrid`/`Split` belonged. Items 5, 6, 7, 8 are independent and need the follow-up spec.
