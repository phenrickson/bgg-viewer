# Plan — The Landing Warm Gap

**Spec:** [2026-08-03-landing-warm-gap-design.md](../specs/2026-08-03-landing-warm-gap-design.md)
**Branch:** `feat/landing-warm-gap` → PR into `main`
**Date:** 2026-08-03
**Status:** steps 1–6 built; awaiting visual review

## Goal

Fill the gap between "the landing page has rendered" and "the catalog is ready" with
something terminal and worth looking at, and bound the wait.

**Success:** a viz-of-the-day and a featured game render *with* the landing page (no extra
wait), the warming pill states roughly how long, both survive light and dark, and nothing
regresses on a warm load.

## Affected surfaces

| Surface | Change |
|---|---|
| `src/lib/landing/` | New — components, rotation, content types, fallback JSON |
| `src/routes/(app)/+page.svelte` | The only touched existing file |
| `scripts/build-landing-content.ts` | New — the generator |
| `.github/workflows/release-please.yml` | New step, before `docker build` |
| `.gitignore` | Ignore `content.generated.json` |
| `package.json` | One script entry for the generator |

Reused as-is, not modified: [Scatter.svelte](../../../src/lib/charts/Scatter.svelte),
[MiniHistogram.svelte](../../../src/lib/charts/MiniHistogram.svelte),
[MiniColumns.svelte](../../../src/lib/charts/MiniColumns.svelte),
`Container`/`Stack`/`AutoGrid` from
[$lib/components/ui/layout](../../../src/lib/components/ui/layout/index.ts).

## Ordering principle

**Get something on screen to look at before building any data pipeline.** Steps 1–4 run
entirely off committed fallback content, so the shape can be judged in the browser before a
line of BigQuery is written. If the shape is wrong, steps 5–6 were never wasted.

## Steps

### 1. Types + rotation

`src/lib/landing/types.ts` (the `LandingContent` / `Viz` / `Featured` shapes from the spec)
and `src/lib/landing/rotation.ts` — `dayIndex(now)` and `pick(list, dayIndex)`, pure.

*Verify:* `rotation.test.ts` — index advances once per day, wraps at list length, is stable
within a day, and two lists of different length (12 / 30) produce a pairing that does not
repeat before their LCM. `pnpm test`.

### 2. Fallback content, hand-authored

`src/lib/landing/content.fallback.json` — 2–3 vizzes and 3–4 featured games, real data typed
in by hand, validated against the step-1 types. Small on purpose: it exists to make the
components renderable and to be the credential-less fallback, not to be the final set.

*Verify:* a shape test asserting the committed JSON parses to `LandingContent`. `pnpm test`.

### 3. `VizOfTheDay.svelte` + `FeaturedGame.svelte`

`VizOfTheDay` switches on `viz.kind` and delegates to the existing `Scatter` / `MiniHistogram`
/ `MiniColumns`. `FeaturedGame` is a card: box art from the BGG CDN, name, year, geek rating,
weight, best-at, linking to `/games/{id}`.

Colour via semantic tokens only, per `style-rules`. No hardcoded hex.

*Verify:* `pnpm exec svelte-check` clean.

### 4. Wire into the landing page — **visual checkpoint**

In [`(app)/+page.svelte`](../../../src/routes/(app)/+page.svelte): an `AutoGrid min="lg"`
holding the two cards, placed below the chips and above the door. Plus the pill —
bounded wording (placeholder `~20 seconds`) and the catalog stats line, keeping its existing
ready/error branches intact.

*Verify:* `pnpm dev`, load the landing page, **light and dark both**. Throttle or run against
a cold service to see the real gap. **Stop here for Phil to look at it.**

### 5. The generator

`scripts/build-landing-content.ts` — queries BigQuery for the viz series, the featured-game
pool, and the stats; writes `src/lib/landing/content.generated.json`. Reuses the existing
BigQuery client setup from [build.ts](../../../src/lib/server/catalog/build.ts).

The component imports generated-if-present, else fallback. Add `content.generated.json` to
`.gitignore` and a `landing:content` script to `package.json`.

*Verify:* run it locally against real credentials; assert output validates against the
step-1 types and is **≤ 60 KB gzipped** (the spec's budget). Confirm `pnpm build` still
succeeds with the generated file absent.

### 6. CI wiring

A step in [release-please.yml](../../../.github/workflows/release-please.yml) after
`google-github-actions/auth` and **before** `docker build`, running the generator so
`COPY . .` picks it up. Non-fatal on failure — the build proceeds on the fallback.

*Verify:* the deploy job's log shows the generator ran and wrote the file; the deployed
landing page shows generated (not fallback) content.

## Risks / unknowns

- **No credentials in the Docker build.** The `build` stage runs plain `node:22-slim`, so
  the generator cannot live in the Dockerfile. This is why step 6 puts it in the workflow.
  Verified by reading the Dockerfile, not assumed.
- **Bundle size.** 60 KB gzipped is a budget, not a measurement. Step 5 must actually check
  it; if 12 vizzes overshoot, cut point counts before cutting vizzes.
- **The wait may not be what we think.** The 22 s figure is the *server* build. The
  client-side cost — DuckDB instantiate, `insertArrowFromIPCStream`, and the 35 k-row name-map
  scan at [catalog.svelte.ts:64](../../../src/lib/catalog/catalog.svelte.ts#L64) — is
  unmeasured. If the real gap on a warm instance is mostly client-side, the pill's `~20
  seconds` is wrong. **Measure before finalising that string** (step 4 is the natural place).
- **Not one-way.** Everything here is additive and behind a feature branch. Rollback is
  reverting the PR; no schema, no data, no infra change.

## Out of scope

Explore's and Discover's loading states; making the catalog faster (`min-instances`, a
GCS-cached artifact); the CPU contention behind 8–11 s mid-build detail loads; the name-map
cost above beyond measuring it.

## Open questions blocking step 5 (not steps 1–4)

1. Which viz subjects — how many, and which stories?
2. Featured games: curated, or a rule (sample the top 2,000 by geek rating)?
3. Stroll: arrows only, or a "see all" gallery?

Steps 1–4 proceed on the hand-authored fallback regardless of these.


## What actually shipped

All six steps are built. Deltas worth knowing about, each forced by something measured
rather than chosen on taste:

| Planned | Shipped | Why |
|---|---|---|
| `content.generated.json` + `content.fallback.json` | one `content.json` | The two-file design shipped **both** in the bundle — 12.4 KB duplicated. The fallback import keeps the file alive whichever wins. |
| Hand-authored fallback, 2–3 vizzes | generator output, 11 vizzes / 24 games | Real data was cheaper to produce than fake data was to type, and makes the rotation actually rotate. |
| `scatter` + `columns` | + `bars` | Categorical series (mechanics, designers) are unreadable as vertical columns with rotated labels — and they are what this app exists to query by. |
| Two cards in an `AutoGrid` | four editorial sections at the page foot | Review feedback: the pair sat between the chips and the door; the ask was content you scroll to. |
| Pill says a hardcoded `~20 seconds` | median of this browser's last five loads | Removes the risk below entirely — see it struck through. |
| `.ts` generator | `.js` | Matches `scripts/doctor.js` and `scripts/setup-env.js`; no `tsx` in the toolchain. |

### Measured

- Content: **12.4 KB gzipped** (11 vizzes, 24 games) against a 60 KB budget, enforced by both
  the generator's exit code and `content.test.ts`.
- Landing chunk: **15 KB gzipped** after de-duplication, down from 25 KB.
- `pnpm build` verified to succeed **without** credentials, on the committed snapshot.
- `svelte-check` clean; **130 tests** pass (13 new).

### Risk resolved

> ~~**The wait may not be what we think.** The 22 s figure is the *server* build… If the real
> gap on a warm instance is mostly client-side, the pill's `~20 seconds` is wrong.~~

`estimate.ts` sidesteps this rather than settling it. The client times its own load end to end
— build, transfer, wasm instantiate, insert, index — stores it, and quotes the median of the
last five back. The figure now describes the machine doing the waiting, so the split between
server and client cost no longer has to be known for the pill to be honest.

Still worth measuring for its own sake: the `SELECT game_id, name` name-map scan over 35 k rows
at [catalog.svelte.ts:64](../../../src/lib/catalog/catalog.svelte.ts#L64).

### Not verified

**Nothing has been looked at in a browser by me** — no screenshot tool here. Tokens are all
semantic (no hardcoded colours in `src/lib/landing/`), and `--chart-1` is deliberately
theme-independent in `app.css`, so dark *should* be correct by construction. It has not been
confirmed by eye.
