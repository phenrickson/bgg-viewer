# Recommend: shelf answers ranked in the browser — design

**Date:** 2026-11-09
**Status:** Built on `feat/recommend-tool`, 2026-11-09 (plan: `docs/superpowers/plans/2026-11-09-recommend-shelf-in-browser.md`). Measured on the real data: 37,765 rows, 9.45 MB gzipped (the working set includes this year's and upcoming games); `rankCatalog` reproduces `game_neighbors` on 15/15 test lists.
**Branch:** `feat/recommend-tool` (pushed, no PR yet; branched from `main` at 0.0.27)
**Builds on:** `2026-09-25-recommend-ui-and-why-design.md` (the page, the three lists, "why").
**Replaces:** that spec's §2 "Where each list comes from" for the two shelf pools, and its §6
"Productionizing" plan (the per-collection artifact via a Dataform model).

## Why

`feat/recommend-tool` is the neighbour search ("games like this one"). It's meant to ship, and
a review on 2026-11-09 found it isn't deployable as it stands:

- **The shelf pools don't work in production.** "My shelf" and "games I don't own" read a
  per-user artifact that `scripts/build-collection-neighbors.ts` writes to `.cache/` on Phil's
  machine. The production image copies only `build/`, so `/api/collection-neighbors` 404s for
  everyone and the page silently falls back to "anywhere".
- **The shelf pools are part of why this tool exists** (Phil). They're opt-in: you look at a
  game's answer, then flip to *on my shelf* or *not on my shelf*. And once you're in a shelf
  pool you click game to game, so a ~3 s wait per click is unwieldy (Phil).

The ~3 s is BigQuery's job overhead plus a full-table read for the rating percentile — not the
work itself. "Which of my ~160 games is closest to this one" is a few thousand dot products.
The precomputed "anywhere" lists are instant only because `game_neighbors` ranked them ahead of
time; a shelf pool can't reuse them, because a game's best match on your shelf is rarely in its
catalog top 10.

So: **ship the inputs once, rank in the browser.**

## Goals

- *On my shelf* and *not on my shelf* answer in production, for any user with a linked
  collection, and for any username an admin views as.
- After a one-time load, every click in a shelf pool is instant.
- A collection is usable as soon as it's synced — no per-user build, no wait for a pipeline run.
- *Not on my shelf* ranks with the same rules as the warehouse's `game_neighbors`, so its lists
  read like the "anywhere" lists with owned games taken out.
- The review's bugs are fixed (§6), so the page is deployable.

## Non-goals

- Tuning the shelf styles (§2) beyond a first cut. They ship as a starting point and get tuned
  against real collections afterwards.
- Changing *anywhere*. It stays on the precomputed lists from the game document.
- Warehouse changes. The warehouse's pooled `POST /games/{id}/similar` stays deployed; the
  viewer just stops calling it for shelf answers.
- Level-2 "why", multi-seed search, retiring Discover.

## Anti-goals

- **A wait on every click in a shelf pool.** That's the failure this design exists to avoid.
- **Shelf lists that disagree with the warehouse's** for the same rules. Ranking is ported, so
  it has to be checked against `game_neighbors`, not trusted.
- **Per-user build artifacts.** They're what made the prototype undeployable and stale.

## What was measured (2026-11-09, throwaway spike)

Scripts and data in the session scratchpad, not the repo. BigQuery billed ~200 MB in total.

- **Rows.** `analytics.game_similarity_search` has 130,987 games, but every profile requires
  ≥30 user ratings (`min_users_rated` 30 or 100), so only **31,721** can ever be a *not on my
  shelf* result.
- **Size** (31,721 × 64-d, Arrow IPC with complexity, users_rated, rating percentile and
  product line): float32 **7.9 MB gzipped** (8.8 MB raw); int8 1.9 MB gzipped.
- **Speed** (Node 22 / V8, Phil's desktop): parse + normalise **16 ms**; *not on my shelf*,
  all three profiles at once, **~5 ms per click** (averaged over all 162 of phenrickson's
  owned games as seeds); *on my shelf*, all 162 seeds in **10 ms total**.
- **Fidelity.** Porting the `game_neighbors` rules to JS and ranking five seeds (Wingspan,
  Brass: Birmingham, Take 5, Catan, Azul) "anywhere": **float32 reproduced all 15 lists
  exactly** — same games, same order. **int8 matched only 4/15** (same games ~99%, order
  shuffled), so int8 is out.
- **Not measured:** a real browser, a phone, a real network.
- **Embedding versions.** The table holds v6 for all but 10 games, which are still v5.

## Design

### 1. Vectors artifact

A new in-browser artifact, published like the catalog, thumbnails and coordinates.

- **Rows:** the catalog's working set (`WORKING_SET_WHERE`: rated ≥30, or published this year
  or later), so every game the search can offer as a seed has a vector. ~32k rows.
- **Columns:** `game_id` int32; `embedding` FixedSizeList<float32, 64>; `complexity` float32;
  `users_rated` int32; `geek_pct` float32 (`PERCENT_RANK() OVER (ORDER BY geek_rating)` over
  every game with `geek_rating > 0` in `game_similarity_search`, else 0 — exactly as
  `game_neighbors` computes it); `line` int32 (product line, null if none).
- **Schema metadata:** `embedding_model`, `embedding_version`, and the
  `analytics.similarity_profiles` rows as JSON. The browser ranks with the profiles it was
  shipped, so the rules come from one source and aren't copied into TypeScript constants.
- **Precision:** float32 (int8 fails fidelity).
- **Kept separate from the catalog**, for the coordinates artifact's reason: weight most
  sessions never use.
- **Build:** `scripts/build-vectors-artifact.ts`, a step in `viewer-artifacts.yml` after
  coordinates. It reuses `src/lib/server/vectors/columns.ts` + `serialize.ts` and
  `scripts/lib/publish-artifact.ts`, like the other three.
- **Serve:** `/api/vectors`, the same pointer → signed URL shape as `/api/coordinates`;
  the client reads it with `fetchArtifactBytes` and plain `apache-arrow` (no DuckDB), as
  `src/lib/map/coordinates.ts` does.
- **Version:** the build keeps every row, whatever its `embedding_version`, because
  `game_neighbors` doesn't filter by version either, and matching it exactly is the bar. The
  metadata records the latest version and logs how many rows are on older ones (10 at v5 on
  2026-11-09). Zero rows fails without publishing (as `publishArtifact` already does).
- **Ranking columns come from `game_similarity_search`**, not the catalog's features, since
  that's what `game_neighbors` ranks with (they can lag the catalog slightly).
- **New code:** `src/lib/server/vectors/columns.ts` + `serialize.ts`, modelled on
  `src/lib/server/coordinates/`. The spike's scripts aren't brought in.

### 2. Ranking in the browser

A pure module, `src/lib/recommend/rank.ts`, unit-tested without a browser.

- **Load (Phil, 2026-11-09):** when `/recommend` is opened, and only there, the vectors
  artifact starts loading in the background **after the catalog is ready** (so it never
  competes with the catalog, which the search and *anywhere* need), and **only when there's a
  collection** (a linked user, or an admin's view-as username once it loads). No other page
  fetches it. It's parsed once per session into flat typed arrays, vectors L2-normalised so
  cosine is a dot product. A flip to a shelf pool before it has arrived shows the normal
  loading state and fills in when it lands.
- **Not on my shelf:** for each of the shipped profiles, the `game_neighbors` rules with
  candidates = the artifact minus the seed and minus owned games: source floor
  (`source_min_users_rated`), candidate floor (`min_users_rated`), complexity band,
  similarity floor, rating-percentile floor/ceiling, score `weight·sim + (1−weight)·geek_pct`,
  product-line cap (`max_per_family`; 0 drops games in any line), `top_k`. Returns the three
  styles, so the page shows Recommended / Most similar / Dark horses as it does now.
- **On my shelf: the same three choices** (Phil, 2026-11-09), with rules for a small pool. The
  catalog profiles collapse on a ~160-game shelf (warehouse measurement 2026-09-24: Dark Horses
  empty, Recommended == Most Similar, lists short from the complexity band and similarity
  floor), so the shelf gets its own, as a starting point to tune:
  - **Most Similar:** owned games by plain similarity, product-line cap 1, top 10. (Today's
    shelf list.)
  - **Recommended:** `0.6·sim + 0.4·shelf_pct`, where `shelf_pct` is the game's geek-rating
    percentile *within the shelf*; no floors, no band; product-line cap 1, top 10.
  - **Dark Horses:** owned games with `shelf_pct < 0.5` (the less-celebrated half of the shelf),
    by plain similarity; product-line cap 1, top 10.

  So `Lists` for a shelf answer carries the three styles like the catalog lists do, and the
  page's picker works the same in every pool. The shelf rules live in `rank.ts` beside the
  catalog port, as one constant, not scattered.
- **Any seed works.** The near-miss (part D) and live `pool=collection` cases disappear: every
  seed in the working set has a vector, so both shelf pools rank any seed the same way.
- **Seed outside the artifact** (can only happen via a hand-edited `?id=`): the shelf pools
  show the empty state.

### 3. The collection

- The owned ids come from the existing `/api/collection?username=` (own linked username, or any
  username for an admin), read from `collections.user_collections`.
- **Owned games not in the artifact** (fewer than 30 ratings and not upcoming) are left out
  everywhere on the page. See *Decisions*.
- `hasShelf` means "a collection with at least one owned game", no longer "an artifact loaded".

### 4. Admin: view as an unseen username

- **Today:** `triggerSync` (`src/lib/server/collections/sync.ts`) calls the
  bgg-collection-scoring service's `/sync/{username}`, fire-and-forget, from registration and
  Settings only, for your own username.
- **New:** an admin-only `POST /api/collection/sync?username=`, which calls
  `triggerSync(username)`. Non-admins get 403.
- **Flow:** the admin enters a username. `/api/collection` returns nothing, so the page calls the
  sync endpoint, shows "fetching {username}'s collection from BGG…", and re-asks
  `/api/collection` every 5 s until owned games appear, giving up after 3 minutes with a
  message. The admin can leave and come back; once the sync has landed it just loads.
- Switching username clears the previous user's owned set, shelf row and answer immediately.
  A newer switch cancels an older one's late result (§6).

### 5. What goes away

- `scripts/build-collection-neighbors.ts`, `src/lib/server/collection-neighbors/` (cache,
  columns, serialize) and `/api/collection-neighbors`. This also removes the `cachePath`
  username collision (two handles mapping to one file).
- The `collection_neighbors` DuckDB table and the `nearMiss` set on the page.
- `/api/similar`'s `pool=collection` and `pool=exclude` branches, and the client's
  `getSimilarPooled` usage for them. `/api/similar?pool=all` stays.
- In `sources.ts`: the `artifact` and `live` source kinds, `MIN_AFTER_OWNED` / `tooThin`
  (no longer needed: *not on my shelf* ranks the whole catalog minus owned, so it never comes
  back thin from filtering).

### 6. Deployment fixes on the page

From the 2026-11-09 review, each confirmed against the branch:

1. **Stale answer on a new seed.** When the seed changes, the previous seed's lists must not
   render under the new seed. Clear `lists` (or key them by seed and pool) when the question
   changes, so the loading state shows until the new answer lands.
2. **Leftover shelf on a username switch.** A failed or empty collection load clears `owned`
   and `shelfSeeds`; nothing from the previous user's collection survives a switch.
3. **Racing collection loads.** Collection loads carry a token like the answer effect does; a
   stale response is dropped.
4. **The trail.** A fresh pick from the search or a Start tile starts a new trail; only "Games
   like this" and the breadcrumb extend or cut it. Games from an unrelated earlier trail are
   never filtered out of an answer.
5. **One "why" at a time.** Solved by the page change below: one list shows at a time, and the
   panel opens under the game it's about.
6. **No duplicate fetches.** The *anywhere* answer doesn't re-run because collection state
   changed; it depends only on the seed.
7. **One access rule.** The "own username or admin" check moves into one helper
   (`canReadCollection(user, username)` in `$lib/server/auth`) used by `/api/collection`,
   `/api/collection/sync` and anywhere else that takes a username.
8. **Nav copy.** The Tools-menu entry's description is
   `PLACEHOLDER(Phil): one-line description`. Phil writes it; it's flagged here, not a blocker
   for building, but it must be filled before the PR is merged.

### 7. The page as built (2026-11-09, reviewed live by Phil)

- **Two labelled sections.** "Selected game" over the chosen game's card, and a fixed, muted
  "Games like **X**" over the answer, followed by the pool control ("from my shelf | games I
  don't own | anywhere") and Cards | List on the same line. Small labels tight on their boxes;
  the page's gap between the two sections.
- **One list at a time, as tabs onto a sheet.** Recommended (first, the default) / Most Similar /
  Dark Horses are tabs — `SegmentedControl` with per-option descriptions renders as tabs on a
  baseline — and the chosen tab opens into the bordered sheet holding the games. The pick is in
  `?list=`; a new chosen game starts on Recommended. A list with no games for this seed has a
  disabled tab ("No matches for this game."). Every pool, *my shelf* included, has the same three.
- **All 10 by default**; no "All / Fewer". All three lists' games are looked up together when an
  answer lands, so switching tabs never collapses the sheet.
- **A tile does one thing: it opens its "why"**, right under it (a full-width grid item in a
  densely packed grid; under the row in List). No icon buttons on tiles.
- **The "why":** "Why **X** is an 84% match" (muted, name at full colour), then the matched game
  and the chosen game side by side, each headed by its box art (96 px) with name, year and
  stacked text links under it in the game page's "View on BGG ↗" style — "Go to game page ↗",
  and for the matched game "Find games like this". Complexity (number + the app's banded badge,
  with an ⓘ for the predicted-complexity note), players and play time (plain minutes, as the
  rest of the page) as plain values; mechanics, categories and families side by side, shared
  tags filled in their usual colours, the rest plain. No verdicts.
- **Showing that the answer changed.** While an answer is on its way the current tiles dim and
  stop taking clicks; when it lands, or the tab changes, the list fades in (off under
  prefers-reduced-motion). A new pick scrolls the chosen game into view.
- **Removed:** Surprise me (its draw logic stays in `sources.ts`, tested), the breadcrumb trail
  (Back walks the history; only the chosen game is left out of its own answer).

## Decisions (Phil, 2026-11-09)

1. **The ~8 MB one-time download is acceptable** (about 2.5 s at 25 Mbps, 6 s at 10 Mbps;
   cached after). float32 as designed. It loads in the background when the tool opens (§2).
2. **Owned games outside the working set are left out** (fewer than 30 ratings, not upcoming).
   They are not in the artifact, never appear in shelf answers, and are also left out of the
   Start screen's "Your shelf" row and of `owned` for ranking purposes, so nothing on the page
   offers a game that would answer empty. The owned set is the collection's owned ids that are
   in the artifact; the shelf row queries only those.

## Calls made in this design (not Phil's)

- Vectors artifact separate from the catalog; float32; working-set rows; profiles shipped in
  the artifact's metadata.
- *Not on my shelf* uses the full `game_neighbors` rules.
- The shelf styles' first-cut rules (§2): within-shelf rating percentile, 0.6/0.4 blend for
  Recommended, bottom half of the shelf for Dark Horses, no floors or band.
- Polling (5 s, 3 min cap) for an admin's unseen username, rather than a "sync finished" signal.
- Keep every embedding version in the artifact, so it matches `game_neighbors` exactly.

## Verification

- `rank.ts` unit tests on a small fixture, including each profile rule and the product-line cap.
- A one-off check, run once before the PR and recorded in it: rank a handful of seeds
  *anywhere* with `rank.ts` against the published artifact and compare to `game_neighbors`;
  every list must match exactly.
- Time the first flip and a shelf click in a real browser, on desktop and on a phone (or
  Chrome's CPU throttling), and record the numbers in the PR.
- Existing tests for `sources.ts` and `why.ts` updated for the removed source kinds.
