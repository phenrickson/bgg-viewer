# Public landing page — implementation plan

Spec: `docs/superpowers/specs/2026-09-11-public-landing-design.md`

## Goal

`/` renders for a logged-out visitor as a static pitch page built from `content.json`; the
same page, logged in, warms the catalog and opens straight into the rooms. No other gate
moves.

**Success:** `curl -sI https://boardgame-viz.com/` returns 200, not 303. A logged-out page
load makes zero requests to `/api/catalog`. Logged in, behaviour matches today's plus the
new layout. Phil has signed off on the design after iterating on it locally.

## How this plan differs from the last one

The GCS work was infrastructure with a measurable target. This is a design problem: the
right answer is not fully knowable up front, and Phil wants to **iterate on it locally and
give feedback**. So the middle of this plan is a loop, not a sequence, and the PR opens only
once the loop has converged — not before.

## Affected surfaces (bgg-viewer only)

- `src/routes/(app)/+page.svelte` → moves to `src/routes/+page.svelte` (out of the group)
- new `src/routes/+page.server.ts` — expose `user` so the page can branch
- `src/lib/landing/*` — `FeaturedGame`, `VizOfTheDay`, `content.json` reused; `WarmGap`
  demoted or removed
- `static/` — two new screenshots (Explore, Discover)
- tests for the auth-branching logic

## Steps

### Phase 0 — set up for iteration

**0.1 Branch** `feat/public-landing` off `main`.

**0.2 Load the `frontend-patterns` skill** before writing any component. It covers the layout
system, fluid type, page structure and Svelte 5 patterns this page must match — and it is
the step that gets skipped and then corrected after the fact.

**0.3 Two local states, switchable.** `just dev` with `DEV_AUTH_EMAIL` set in `.env` is the
logged-in view; unset it (or a second terminal with it cleared) for logged-out. Phil looks at
both at `http://localhost:5173`. No browser automation — Phil is looking at it himself.

*Verify:* both states render before any design work starts.

### Phase 1 — the structural unlock (small, mechanical, first)

**1.1 Move `/` out of `(app)`.** Relocate `+page.svelte`; add `src/routes/+page.server.ts`
returning `{ user: locals.user }`. The `(app)` layout guard is not touched.

**1.2 Guard the catalog.** `initCatalog()` and the warming indicator run only when
`data.user` is present. Logged out, nothing calls `/api/catalog`.

**1.3 Doors and chips carry `?next=`** when logged out, so login lands the user on what they
clicked.

*Verify:* logged out → page renders, Network tab shows no `/api/catalog` call, a chip goes
to `/login?next=…` and login returns to the intended room. Logged in → identical to today.
This phase is complete and shippable on its own; it just looks like the old page.

### Phase 2 — design iteration (the loop)

Build the fantasycalc-shaped page in **rounds**. Each round: I make a change, Phil looks at
it in both auth states, gives feedback, I adjust. **Copy is placeholder throughout and
clearly marked** — layout and hierarchy are what is being iterated, not words.

Suggested order, one round each — but Phil's feedback decides the order:

**2.1 Hero.** Headline, one line, live game count, one viz from `content.json`, two doors.
Expect to try more than one arrangement (viz beside vs below; one door vs two).

**2.2 Sneak peek.** Six or seven featured games as a real table — box art, rating, weight,
rank fact — faded at the bottom. Footer varies by auth. This is the most important element
and probably takes more than one round.

**2.3 How it works** — two or three sentences (placeholder), and where it sits relative to
the sneak peek.

**2.4 Try a question** — the chips as a demoted row.

**2.5 Whole-page pass** — spacing, order of sections, what to cut. Phone width.

*Verify each round:* Phil says what is wrong; it changes. The loop ends when Phil says it
has converged, not when I think it has.

### Phase 3 — screenshots

**3.1** Take screenshots of Explore and Discover with real results showing, at a consistent
size. These do not exist and must be produced. Phil can take them, or I can from the dev
server if asked.

**3.2** Drop them into the Features section with a line each.

*Verify:* they read at phone width and are not enormous files.

### Phase 4 — finish

**4.1 Tests.** Auth-branching: doors carry `?next=` logged out and not logged in;
`initCatalog` is not called without a user. Existing `content.test.ts` / `rotation.test.ts`
adjust if `WarmGap` changes.

**4.2 `svelte-check` 0 errors, full suite green.**

**4.3 Copy handoff.** Every placeholder string listed in the PR so Phil can replace them in
one pass — or ship placeholder and iterate.

**4.4 Open the PR** — only now, once the design has converged. Phil merges.

## Risks

- **Iterating without feedback.** The failure mode is me deciding the design has converged.
  The loop has an explicit exit condition — Phil says so — for that reason.
- **Forgetting the `initCatalog` guard.** Logged out it 401s at `/api/catalog` and the page
  says "Catalog failed to load" — the one thing that would look broken. It is step 1.2, first.
- **Layout `user` vs page `user`.** The root `+layout.server.ts` already exposes `user`; the
  new `+page.server.ts` should read the same `locals`, not a second source.
- **Nothing here is one-way.** No data, schema, or infra changes. Rollback is reverting the
  PR.

## Out of scope

- Opening the catalog, game detail, or registration — decided in the spec.
- Live data on the landing page.
- `/about` — decide during Phase 1; cheap either way. Default: leave it as is.
- Any change to the login or register pages.

## Delivery

One PR from `feat/public-landing`, opened at Phase 4. Nothing deployed until Phil merges it
and the release PR.
