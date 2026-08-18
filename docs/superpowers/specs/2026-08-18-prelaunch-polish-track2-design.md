# BGG Viewer — Pre-launch Polish, Track 2 — Design (draft)

**Date:** 2026-08-18
**Status:** Draft — options laid out, decisions pending Phil
**Related:** Track 1 (mechanical fixes) shipped separately in
[PR #30](https://github.com/phenrickson/bgg-viewer/pull/30). This covers the items that are
genuinely visual-language decisions, not one-off fixes — they touch shared components used by
both Discover and Explore, so the decision should be made once, here, rather than improvised
per-page mid-implementation.

## Goal

Five open items from the pre-launch review, all bigger than a fix, plus one investigation that
came up mid-discussion (§6, below):

1. Show game complexity as a visual indicator, consistently, on both Discover and Explore.
2. Improve the rating-score display.
3. Decide whether/how a trimmed-down Explore variant should exist.
4. Add real analysis charts to Explore (mechanics frequency, complexity-vs-rating,
   average-rating-vs-log(ratings)) — porting ideas already built for the About page.
5. Decide bundle-vs-lazy-fetch for real box art thumbnails on Discover/Explore rows.

## Current state (grounding, not guesswork)

Two things worth knowing before picking an option:

- **Discover and Explore already encode complexity and rating differently**, and not for a
  documented reason that covers both gaps:
  - Complexity — Discover (`GameRow.svelte`) shows a **word** ("Medium-Heavy") in a pill tinted
    by an ordinal, colorblind-safe, single-hue ramp (documented in-code as deliberate: a reader
    "who has not asked to think in a 1–5 weight scale should not have to"). Explore
    (`GameList.svelte`) shows a **5-segment meter + number**, in `--chart-4` (purple), inlined
    directly in the component rather than extracted anywhere shared.
  - Rating — Discover reimplements its own 5-segment meter against the same domain constants
    (5.5–8.8) and the same `--chart-1` hue as Explore's shared `RatingBar.svelte`
    (`$lib/catalog/encodings/`) — a near-duplicate of a component that already exists, rather
    than a use of it.
  - `$lib/catalog/encodings/` already exists as the shared-encoding home (`RatingBar`,
    `PlayerPips`) — there's no `ComplexityMeter` in it yet.
- **A per-game thumbnail URL already exists server-side.** The warehouse client returns
  `thumbnail` (`lib/server/warehouse/types.ts:57`), and What's New already renders it with a
  plain lazy `<img>`. What's deliberately excluded is only the *client-side DuckDB catalog
  artifact* — `lib/server/catalog/columns.ts` explicitly omits "the heavy fields
  (description/image)" to keep the ~1MB artifact from growing by the previously-measured
  ~1.6MB gzipped. Discover and Explore run against that artifact; What's New runs a normal
  server load. That's why What's New has real box art and Discover/Explore have initials.

## 1. Complexity as a visual indicator

**Recommendation: extract one shared `ComplexityMeter.svelte`, reuse it on both pages.**

Concretely: pull Explore's existing 5-segment meter out of `GameList.svelte` into
`$lib/catalog/encodings/ComplexityMeter.svelte`, recolor it with the ordinal ramp Discover's
`.cx` badge already uses (single hue, intensity by band — already colorblind-safe and
documented) instead of the unrelated `--chart-4` purple, and use it in both places:

- Discover keeps the word (it's the thing that makes the row readable without learning a
  1–5 scale) and gains the meter beside it as the visual indicator that was missing.
- Explore keeps its number-first meter, just recolored to match — visually the same
  *language* as Discover's badge, so a reader who's seen one recognizes the other.

Considered and set aside: a non-numeric icon/dial (stacked shapes, a gauge) instead of a meter —
more distinctively "Discover," but it's new visual vocabulary invented from scratch for one
page, and it still has to be reconciled with Explore's meter eventually. The shared-component
route gets the consistency the review flagged for free, using an encoding both pages already
half-have.

## 2. Rating score display

**Recommendation: converge Discover onto the real `RatingBar`, then improve that one component.**

Discover's rating meter is presently a hand-rolled duplicate of `RatingBar` (same domain, same
color, different shape — 5 segments vs. continuous). Fix the duplication first: have Discover
render `RatingBar` directly. Once there's one component instead of two, "improve the rating
score" becomes one change instead of two — e.g. adding a couple of unlabeled reference ticks at
round numbers (6, 7, 8) so the fixed 5.5–8.8 domain has legible landmarks instead of an
unmarked bar. Small, shared, low-risk.

A bigger redesign (radial gauge, a "top N%" treatment like the game-detail hero already has) was
considered and set aside for a list row — that page already has a place for the fuller "where
this stands" story, and duplicating it into every row is a lot of ink for a list meant to be
scanned quickly.

## 3. A trimmed-down Explore variant

This is the one genuinely open question — three real options, not variations of one idea:

**A — A view mode inside Explore.** A "Simple / Advanced" toggle that collapses the Rail's
lower-value groups (Series & families, People & publishers, Exact numbers) and shrinks the
Shape Strip to one headline stat. Cheapest — a mode flag and conditional rendering, nothing new
to build. Risk: it's still the same dense grid with fewer visible controls, which may not read
as calmer, just sparser.

**B — Don't build a third tier; invest in the Discover→Explore handoff instead.** Decide
Discover already *is* the trimmed room (it was built to be exactly that), and Explore is
deliberately the one dense workshop. Zero new UI. Risk: doesn't address "still shows the world
of games" the way Explore's Shape Strip currently does — Discover has no set-shape view at all.

**C — A new middle view: a visual card grid.** Same `Scope`/`where`, same filters, but rendered
as a responsive card grid (box art, name, rating, complexity meter) with the Shape Strip above
it and no dense table. Ties directly into the thumbnail decision below — this is the view that
actually benefits from real box art. Biggest lift: it's a new `GameList`-equivalent rendering
path, not a mode flag.

**No recommendation yet — this needs your call.** C is the most honest answer to "trimmed but
still world-scale," but it's also the most work, and A is the cheap fallback if there's limited
appetite for a new view right now.

## 4. New analysis charts in Explore

About already has `Scatter.svelte`-based charts (weight-vs-rating, popularity-vs-rating) built
against the *whole* rated catalog. The ask is the same idea, scoped to whatever Explore's
current filters return.

**Recommendation: a new expandable panel below the table, reusing `Scatter.svelte` as-is,
queried against the same `where` GameList already uses** — not folded into the Shape Strip.
The Shape Strip's whole interaction model is "drag a chart to filter further," which fits
histograms naturally; a scatter plot or a mechanics-frequency bar chart doesn't have an obvious
drag-to-filter gesture, and forcing one onto them would be inventing an interaction nobody asked
for. Treating this as read-only analysis of the current set (matching how About's charts behave)
keeps the two widgets' interaction rules distinct and honest about which is which.

## 5. Thumbnails: bundle vs. a second artifact, fetched after

**Real measurement (2026-08-18), not the extrapolation this section originally had.** The
initial numbers here were wrong — see the corrected `reference_bgg_viewer_thumbnail_cost`
memory. The real, current baseline and the real cost of adding thumbnails:

| | Size (gzipped) |
| --- | --- |
| Current catalog artifact (verified from the actual `.cache/catalog.arrow.gz`, 35,554 rows × 24 cols) | **5.2 MB** |
| Real production cold load today (`estimate.ts`'s `DEFAULT_MS`, from actual measurements) | **~22.3–22.9s** |
| Thumbnail URLs alone, gzipped (real query + real gzip, 2026-08-18) | ~1.59 MB (44.8 bytes/row) |
| Thumbnails as their own separate Arrow artifact (`game_id` + `thumbnail`, real build) | **1.89 MB** |

So the current catalog is already 5× the ~1MB this section originally assumed, and the cold
load is already ~22s — there's no slack left in that critical path to spend on anything, let
alone a further ~30% size increase from bundling thumbnails directly in.

**Recommendation: a second, separate Arrow artifact, fetched and attached in DuckDB *after*
the primary catalog is ready — not bundled into the existing 24-column artifact, and not a
per-row batched API endpoint either.** Concretely: `game_id` + `thumbnail` only, built the same
way `catalog.arrow.gz` is, served as its own endpoint, fetched once the primary catalog has
resolved. In-browser, DuckDB attaches it as a second table and Discover/Explore `LEFT JOIN`
against it by `game_id` — thumbnails fade in a beat after the list is already interactive,
rather than gating first paint on them. This was the original recommendation before this
section got rewritten with wrong numbers, and — worth noting — Phil independently proposed the
same shape mid-conversation before seeing that this had already been the answer once.

One real tradeoff worth stating plainly: a second artifact costs ~300KB *more total bytes*
than bundling the column directly into the existing artifact would (1.89MB vs. an estimated
~1.6MB from Arrow's per-artifact framing overhead being paid twice) — bundling is a few hundred
KB cheaper in total. It loses anyway, because *when* those bytes land matters more than the
total count: bundling adds its cost to the one interaction (first filter) that's already
slowest, where a second artifact adds nothing to it at all.

Unlike the main catalog, box art barely ever changes for a given `game_id` — so this artifact
can plausibly use long-lived, immutable-style caching (the way the WASM engine below does)
rather than the main catalog's `must-revalidate` freshness requirement. A returning visitor
could end up paying close to nothing for it, not just "less than bundling."

## 6. Cold-load architecture: is splitting the *catalog itself* worth it?

A related question came up mid-conversation: not just thumbnails, but whether the whole
~35k-row catalog should load in stages — a fast "core" wave, then facets after — for a
snappier first start. Worth recording how that investigation actually went, since it took a
few wrong turns before landing somewhere solid, and the reasoning matters more than the
conclusion alone.

**What's actually spent during the ~22.3–22.9s cold load** (`estimate.ts`'s `DEFAULT_MS`, a
real production measurement, not synthetic):

| Asset | Raw size | **As actually transferred in production** | Cache-Control |
| --- | --- | --- | --- |
| DuckDB-WASM engine (`duckdb-eh.wasm`) | 35.9 MB | **5.45 MB** (brotli) | `public, max-age=31536000, immutable` |
| Catalog artifact (`/api/catalog`) | 15.2 MB (Arrow) | **5.2 MB** (gzip) | `private, must-revalidate` (no long-term cache) |

Two corrections happened while chasing this number down, both worth keeping so the mistake
isn't repeated:

1. First pass compared the WASM engine's *raw* 35.9MB against the catalog's *compressed*
   5.2MB and concluded the catalog was a minor contributor (~15%) — wrong, an apples-to-oranges
   comparison. `WebAssembly.compile()` on the real binary took 56ms locally, confirming compile
   time isn't the cost (transfer time is), but that alone doesn't tell you the *relative* cost
   without comparing like-for-like transfer sizes.
2. Checked production response headers directly (`curl` against the live Cloud Run service,
   `https://bgg-viewer-668088964150.us-central1.run.app`) rather than reasoning about it, and
   found the WASM engine is served brotli-compressed at 5.45MB — almost exactly the catalog's
   own 5.2MB. **They're roughly equal contributors**, not 7:1.

**What that means in practice:**

- **First-ever visit:** WASM and catalog cost about the same. Splitting the catalog would cut
  a real, non-trivial chunk off this specific case.
- **Returning visit:** the WASM engine is immutably cached for a year, so it costs nothing on
  repeat loads. The catalog's `ETag` + `must-revalidate` means a repeat load *should* already
  be a cheap conditional check (304, no body) rather than a full re-download — this is the one
  claim in this section that's design-intent, not directly verified against a real browser.
- **The catch:** a "core" first-wave catalog only helps if it's genuinely useful without the
  facet columns (categories, mechanics, complexity bands, player-count) — and it isn't, for
  this app. Rail exists to filter on exactly those columns. Shipping a catalog that can sort
  and list but can't yet filter, on the page whose whole pitch *is* filtering, trades a real
  functional regression (filters that visibly don't work for a few seconds) for a speed win
  that only applies to first-time visitors.

**Recommendation: don't split the catalog for this reason.** The size case is real but only
pays off once per visitor, ever, and costs a working-filters regression to get there. The
product has already made the more proportionate bet: soften the wait instead of racing to
eliminate it — the landing page's query chips work as plain links before the catalog is ready,
and the "chart of the day" widget exists specifically to give a first-time visitor something to
look at during the wait. That widget's ~30 literal `"PLACEHOLDER — ..."` captions (§ home page
review, Track 1) are a higher-leverage, zero-risk investment in the same first-visit problem
than restructuring the catalog would be.

**Left open:** confirm a real repeat visit actually gets a 304 rather than a full re-download —
cheap to check, not yet done, the one unverified design-intent claim above.

## Unknowns to validate before planning

- **Trimmed Explore (#3):** which option — needs Phil's call, not a default.
- **Thumbnails (#5):** sizes are now real, measured numbers (2026-08-18), not extrapolated —
  see the table above. Still open: confirm CDN/hotlink terms for the image host allow this
  usage pattern at Discover/Explore's row volume (every row, not just What's New's daily
  handful), and confirm the DuckDB attach-a-second-table-and-join pattern performs fine
  in-browser at ~35k rows (untested — should be cheap, but hasn't been timed).
- **ComplexityMeter (#1):** confirm the recolored ordinal ramp reads fine at Explore's smaller
  row height, not just Discover's.

## Next step

Once #3 is decided (and anything else Phil wants to adjust here), this hands off to the
`planning` skill for a sequenced implementation plan — branch/PR per the project's usual
delivery convention, not folded into Track 1's already-merged polish PR.
