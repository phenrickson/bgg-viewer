# BGG Viewer — The Landing Warm Gap — Design

**Date:** 2026-08-03
**Status:** Draft for review
**Branch:** `feat/landing-warm-gap`
**Builds on:** [2026-07-28-client-catalog-architecture-design.md](2026-07-28-client-catalog-architecture-design.md)

> Copy note: all user-facing strings are **placeholder** — Phil writes the final copy. The
> viz subjects, the featured-game note, and the pill wording below are stand-ins to make the
> shape legible, not proposals.

## The problem, stated exactly

Boot is fine. The app shell, the assets, the landing page — all snappy.

The problem is the **gap**: you are standing on the landing page, it has finished rendering,
and you are waiting for the catalog to be ready. Nothing else. That gap is the whole scope
of this spec.

Everything currently on the landing page is a **door to somewhere that is not ready yet**:

| Element | Where it goes | State during the gap |
|---|---|---|
| Query chips (13 of them) | `/discover`, `/games` | Both block on the catalog |
| "Explore the catalog" door | `/games` | Blocks on the catalog |
| "Coming next" list | nowhere | Not built |
| Warming pill | — | A spinner and an indefinite "…" |

So the user reads the h1 and the lede in about five seconds, and then there is nothing on
the page that is *for this page*. The only moving thing on screen is a spinner that gives no
sense of how long.

**What fills the gap must be terminal** — something consumed right there, not another link
out to a blocked room.

## Goal

Give the landing page something worth looking at during the warm, and bound the wait.

### Success criteria

- The gap content is on screen **with the rest of the page** — no additional wait to see it.
- It is **terminal**: consumable in place, not a link into a blocked view.
- The wait is **bounded** — the user is told roughly how long, not just "…".
- It does not regress the page for a warm load, where the gap barely exists.
- Light **and** dark both verified, per the `frontend-patterns` skill.

## Out of scope

Explicitly not this spec, and not this branch:

- Explore's and Discover's loading states. They have the same problem; they are a separate
  change. (Discover already renders its dials during the wait, which is the right instinct.)
- Making the catalog load faster. `min-instances`, a GCS-cached artifact, and the CPU
  contention that makes mid-build detail loads take 8–11 s are all real and all separate.
- The `SELECT game_id, name` name-map build over 35,297 rows on the load path — a plausible
  client-side cost, unmeasured, and its own investigation.

## Design

### Sections down the foot of the page

Four full-width sections at the **foot** of the landing page, in their own `Container
size="content"` (80 rem) rather than the hero's `prose` (52 rem) — 52 rem is the right width
for a sentence and the wrong one for a plot. They alternate:

1. **Chart of the day** — a real chart with a one-line note. This is the piece that earns the
   gap rather than merely occupying it: it is a thing you can only produce from the whole
   catalog, so it *demonstrates what you are waiting for*. Rotates daily; `←/→` strolls the set.
2. **Featured game** — box art, name, year, headline numbers. Its link to `/games/{id}`
   **works during the gap**, because game detail is server-rendered via
   [`games/[id]/+page.server.ts`](../../../src/routes/(app)/games/[id]/+page.server.ts) and
   does not touch the catalog. It is the one door on the page that is not blocked.
3. **A second chart**, then **a second game** — enough depth that scrolling is worth doing.

Styled as editorial sections — hairline rule, eyebrow, large title, plot at full measure —
not as bordered cards. A card reads as a widget parked on the page; these are meant to be
scrolled through. Each fades and lifts as it enters view (`reveal.ts`), which is what makes
the page feel like it unfolds rather than ending in a wall of filler. Under
`prefers-reduced-motion` no observer is created at all and the sections start visible — a
CSS-only opt-out still starts them at `opacity: 0`, which is a blank page for anyone whose
`IntersectionObserver` never fires.

**Catalog stats fold into the pill** — "30,818 games". Turns it from a bare progress
indicator into a statement about what is arriving.

### Bounding the wait

The pill currently reads "Warming the catalog…" beside a spinner. Indefinite.

Measured cold builds: **22.33 s** and **22.85 s** — a 2% spread, predictable enough to state.

But the number quoted is **not** that measurement. `estimate.ts` records how long each load
actually took in `localStorage` and quotes back the **median of the last five**, defaulting to
20 s on a first visit. This sidesteps the risk below entirely: the figure describes the
machine doing the waiting, including whatever share is client-side, rather than a server-side
number measured somewhere else. A median rather than a mean so one pathological load — a
laptop waking from sleep, a throttled tab — cannot poison every later visit.

No server signal is involved, and none should be: the catalog build is the only slow thing and
the client already knows when it started one.

No progress bar in this spec. A bar competes with the viz for attention and says "you are
waiting" while the viz is trying to say "look at this" — and the gap content is the point.
If a bar is wanted later it can be a hairline, not a phased indicator.

**Warm loads:** when the catalog resolves fast the pill goes straight to its ready state. The
two cards stay — they are good landing content regardless, not wait-only furniture. This is
what keeps the change from being dead weight the moment the load gets faster.

### Where the content comes from

The cards must render **with the page**, so they cannot depend on the catalog and must not
cost a round-trip during the gap.

Baked at build time into a JSON module imported by the component, so it ships in the bundle:

```
scripts/build-landing-content.js   →   src/lib/landing/content.json
```

**One file, committed.** An earlier draft of this spec had two — a gitignored
`content.generated.json` plus a committed `content.fallback.json`, picked between at runtime.
Measured: that shipped **both** in the bundle (12.4 KB of pure duplication), because the
fallback import keeps the file alive whichever one wins. CI now overwrites the single
committed file in the working tree and never commits the result.

Budget **≤ 60 KB gzipped**, enforced by the generator (non-zero exit) *and* by
`content.test.ts`. Actual: **12.4 KB** for 11 vizzes and 24 games. Box art loads from BGG's
CDN, so images cost us nothing.

Rotation is deterministic and client-side — `Math.floor(Date.now() / 86_400_000) % len` — over
four slots alternating chart / game / chart / game, the chart and game slots seeded +1 so no
two slots of a kind open on the same item.

**Where the generator runs — not in the Dockerfile.** The `build` stage of
[Dockerfile](../../../Dockerfile) runs `pnpm build` in a plain `node:22-slim` with **no GCP
credentials**, so a BigQuery query there cannot work. It runs as a step in
[release-please.yml](../../../.github/workflows/release-please.yml), which has already
authenticated via `google-github-actions/auth` before it builds the image; `COPY . .` then
picks the file up. The step is `continue-on-error` — the committed snapshot is a valid page,
so a generator failure ships slightly staler charts rather than blocking a release.

### Vizzes reuse the existing charts

No new charting layer. [`Scatter.svelte`](../../../src/lib/charts/Scatter.svelte),
[`MiniHistogram.svelte`](../../../src/lib/charts/MiniHistogram.svelte), and
[`MiniColumns.svelte`](../../../src/lib/charts/MiniColumns.svelte) already exist and already
match the app's language.

> The `frontend-patterns` skill says charts must use LayerChart. `layerchart@^2.0.2` **is** a
> dependency, but none of the catalog charts use it — `Scatter` is Canvas-based specifically
> because ~30k SVG nodes is the failure the Explore spec names. Reusing the hand-rolled three
> keeps the gap cards visually identical to the rest of the app. The skill also references
> `Card.*` and a `Skeleton` component, neither of which exists here. Worth reconciling the
> skill against this repo separately.

```ts
type Viz = ScatterViz | ColumnsViz | BarsViz;
```

`bars` is horizontal and categorical, and exists because vertical columns with rotated labels
are unreadable for "Cooperative Game" or "Hans im Glück" — and those series are exactly the
ones this app exists to make queryable, so they get a form that can show their names.
`columns` labels ticks by **index**, not value: labelling on `v % 5` works for years and
produces nothing at all for a rating axis running 3.0–9.5 in half-points.

Candidate subjects — **Phil's call, listed to size the work**: rating vs. complexity; games
published per year; the rating distribution; best-at player-count spread; geek vs. average
rating; predicted vs. actual for scored games.

Colour follows the `style-rules` skill — semantic tokens, no hardcoded hex, legible both themes.

### Files

```
src/lib/landing/
  content.json              ← committed snapshot; CI overwrites in-tree before docker build
  content.ts                ← types the JSON (a JSON import widens `kind` to `string`)
  types.ts
  WarmGap.svelte            ← the four slots
  VizOfTheDay.svelte        ← scatter | columns | bars
  FeaturedGame.svelte
  rotation.ts               ← pure, unit-tested
  estimate.ts               ← self-calibrating wait, unit-tested
  reveal.ts                 ← IntersectionObserver action
scripts/build-landing-content.js
```

Touched: [`(app)/+page.svelte`](../../../src/routes/(app)/+page.svelte) only.

## Open questions

1. **Viz subjects** — 11 shipped, all `note` strings PLACEHOLDER. Which stories are worth
   telling, and which should go?
2. **Featured selection** — currently a rule: top 24 by geek rating among games with ≥8,000
   ratings, so there is no editorial load per deploy. Curate instead?
3. **Stroll** — arrows only today. Worth a "see all" gallery?
4. **Section count** — four. More depth, or less?

## Delivery

Branch `feat/landing-warm-gap`, PR into `main`. Release and deploy follow the existing
release-please flow — a merged release PR deploys.

Verify per `frontend-patterns`: `pnpm exec svelte-check` clean, dev-server visual check,
**light and dark both**. Unit tests for `rotation.ts` and a shape test for the build script's
output.
