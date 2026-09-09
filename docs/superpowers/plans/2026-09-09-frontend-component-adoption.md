# BGG Viewer — Front-End Component Adoption — Plan

**Date:** 2026-09-09
**Spec:** [2026-09-09-frontend-component-adoption-design.md](../specs/2026-09-09-frontend-component-adoption-design.md)
**Status:** Awaiting approval

## Goal

Get `/whats-new` running locally on real `shadcn-svelte` components so Phil can review it and
decide the scope of everything after. Three PRs to the gate; nothing past the gate is planned.

**Success:** `just dev`, open `/whats-new`, and it looks and behaves as it does today — in both
themes, at every width — but built from `$lib/components/ui/*` instead of ~200 lines of scoped
CSS. `just check` clean throughout.

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
   `@tanstack/svelte-query`, `@tanstack/svelte-virtual`, `svelte-sonner` — `/whats-new` needs
   none of them, and unused deps are how the last fossils got made.
3. **Guard `app.css` through `init`.** Init rewrites it. Back it up first, run init, then diff and
   restore every deliberate line it clobbered — the palette, the comments, `.chart-area`, the
   `@custom-variant dark` rule.
4. `add` only what the pilot needs: `card`, `button`, `badge`, `table`, `input`, `pagination`.
   The rest of the kit's list can wait for a page that uses it.
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

### PR 3 — Pilot: migrate `/whats-new` ← **the review gate**

**Branch:** `refactor/whats-new-components` (off PR 2)

**Files:** `src/routes/(app)/whats-new/+page.svelte`, `Trend.svelte`, possibly `+page.server.ts`.

**Work:**

1. Replace the hand-rolled table with `Table.*` + `@tanstack/table-core`, per the skill's
   Pattern B (embedded, `globalFilter`, pagination). The page already sorts and pages
   client-side over a fully-loaded result set, which is exactly what Pattern B assumes.
2. Replace the scoped `.seg` toolbar with `Button`, and the tier pills with `Badge`.
3. Wrap the regions in `Card.*`; keep `Container`/`Stack` as they are.
4. Put `Trend.svelte` in a `.chart-area` chart card — its first real use in the app.
5. Rename any scoped class that collides with a Tailwind utility (D4). Check this file's
   classes specifically rather than assuming the app-wide count of two still holds.
6. **Do not** change behavior, layout intent, or copy. This PR proves equivalence. If a
   component can't reproduce something the hand-rolled version did, that is a **finding for the
   gate**, not a reason to quietly redesign the page.

**Verification:**
- `just check` clean; `just test` passing.
- `just dev` → `/whats-new` compared side by side against `main`: sorting, the range switch,
  pagination, the trend chart, empty state.
- **Both themes.** Never ship one.
- Width sweep for horizontal overflow — and note honestly whether narrow behaviour improved,
  since that is the whole premise being tested.
- Record the per-page cost (time, lines removed vs added, anything the components couldn't do).
  That number is the main input to the scope decision.

**Risk:** the real one is scope creep — the temptation to fix the page while migrating it.
Equivalence is the deliverable.

---

## Gate — stop here

Phil reviews `/whats-new` running locally and decides. Legitimate outcomes:

- **Carry on page by page**, adopting on contact.
- **Sweep it**, now that the per-page cost is known.
- **Stop.** If the components don't earn their keep here, three revertible PRs is a cheap answer
  to an expensive question.

Only after that: the migration scope chosen, reconciling the `frontend-patterns` skill with what
shipped, resolving the `src/app.d.ts` and `src/lib/query/keys.ts` fossils, and the
`front-end-design` correction — written from what steps 1–3 actually hit rather than guessed at.

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
