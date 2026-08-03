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

### Three pieces, one region

Below the chips, above the door, an `AutoGrid min="lg"` holding two cards, plus a change to
the pill:

1. **Viz of the day** — a real chart with a one-line note. This is the piece that earns the
   gap: it is a thing you can only produce from the whole catalog, so it *demonstrates what
   you are waiting for* rather than merely occupying you. Rotates daily; `←/→` strolls back
   through the rest of the set.
2. **Featured game** — box art, name, year, and the headline numbers. Its link to
   `/games/{id}` **works during the gap**, because game detail is server-rendered via
   [`games/[id]/+page.server.ts`](../../../src/routes/(app)/games/[id]/+page.server.ts) and
   does not touch the catalog. It is the one door on the page that is not blocked.
3. **Catalog stats, folded into the pill** — "35,297 games · 1,247 designers · newest 2026".
   Turns the pill from a progress indicator into a statement about what is arriving.

### Bounding the wait

The pill currently reads "Warming the catalog…" beside a spinner. Indefinite.

Measured cold builds: **22.33 s** and **22.85 s** — a 2% spread. Predictable enough to state.
So the pill says roughly how long (placeholder: `~20 seconds`), which converts an open-ended
wait into a bounded one. That is most of the discomfort, and it costs one string.

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
scripts/build-landing-content.ts   →   src/lib/landing/content.generated.json
```

```ts
interface LandingContent {
  builtAt: string;
  vizzes: Viz[];        // ~12, rotated by day
  featured: Featured[]; // ~30, rotated by day
  stats: { games: number; designers: number; newestYear: number };
}
```

Budget **≤ 60 KB gzipped**. A 500-point scatter of three numeric fields is ~4 KB; twelve of
those plus thirty game cards fits. Box art loads from BGG's CDN, so images cost us nothing.

Rotation is deterministic and client-side — `Math.floor(Date.now() / 86_400_000) % len`, with
different list lengths (12 and 30) so the *pairing* cycles far longer than either list.

**Where the generator runs — not in the Dockerfile.** The `build` stage of
[Dockerfile](../../../Dockerfile) runs `pnpm build` in a plain `node:22-slim` with **no GCP
credentials**, so a BigQuery query there cannot work. The generator instead runs as a step in
[release-please.yml](../../../.github/workflows/release-please.yml), which has already
authenticated via `google-github-actions/auth` before it builds the image; `COPY . .` then
picks the generated file up.

This means a plain `pnpm build` or `pnpm dev` has no generated file, which is exactly what
`content.fallback.json` is for — it is committed, so local development and any credential-less
build render real content. If the generator step fails in CI, the build proceeds on the
fallback rather than blocking a deploy.

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
type Viz =
  | { kind: 'scatter';   title: string; note: string; x: Axis; y: Axis; points: [number, number][] }
  | { kind: 'histogram'; title: string; note: string; field: Axis; bins: number[] }
  | { kind: 'columns';   title: string; note: string; labels: string[]; values: number[] };
```

Candidate subjects — **Phil's call, listed to size the work**: rating vs. complexity; games
published per year; the rating distribution; best-at player-count spread; geek vs. average
rating; predicted vs. actual for scored games.

Colour follows the `style-rules` skill — semantic tokens, no hardcoded hex, legible both themes.

### Files

```
src/lib/landing/
  content.generated.json    ← build output, gitignored
  content.fallback.json     ← committed
  VizOfTheDay.svelte
  FeaturedGame.svelte
  rotation.ts               ← pure, unit-testable
scripts/build-landing-content.ts
```

Touched: [`(app)/+page.svelte`](../../../src/routes/(app)/+page.svelte) only.

## Open questions

1. **Viz subjects** — which six to twelve stories are worth telling?
2. **Featured selection** — hand-curated, or a rule (sample the top 2,000 by geek rating)?
   A rule means no editorial load per deploy.
3. **Stroll** — arrows only, or a "see all" gallery?

## Delivery

Branch `feat/landing-warm-gap`, PR into `main`. Release and deploy follow the existing
release-please flow — a merged release PR deploys.

Verify per `frontend-patterns`: `pnpm exec svelte-check` clean, dev-server visual check,
**light and dark both**. Unit tests for `rotation.ts` and a shape test for the build script's
output.
