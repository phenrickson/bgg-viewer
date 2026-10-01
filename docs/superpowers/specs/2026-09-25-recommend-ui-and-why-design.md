# Recommend: one tool for finding a game — design

**Date:** 2026-09-25 (revised the same day after the first build and the v2 sketches)
**Status:** Built on `feat/recommend-tool` (local), 2026-09-25; awaiting Phil's review. See "Build notes" at the end.
**Branch:** `feat/recommend-tool` (local; rebased on `main` at 0.0.25)
**Related:** bgg-data-warehouse `docs/superpowers/specs/2026-09-24-pool-similarity-and-collection-neighbors-design.md`
(the pooled endpoint and the per-collection artifact). Sketches:
<https://claude.ai/artifact/9ezXBApcvpu1bCPK3sDFS2>, the **v2 row** (boards 4–8). The v1 row is
superseded.

## Why

The `/recommend` prototype showed everything at once: side-by-side panels, a style switcher, a
source label per list. The first rebuild fixed the structure but not the look: it swapped the
sketch's pieces for whatever existed and hand-rolled the rest. v2 is drawn in the app's own
theme and components, and settles three things:

- **Discover folds into this tool.** There are two ways in: *I want games like…* and *Help me
  find a game* (Discover's questions).
- **A clean interface over options.** The only control on a results page is the pool, inside
  the question. The three precomputed lists are content (stacked sections), not a setting, and
  Surprise me is an action, not a mode.
- **Every match says why**, from the embedding's own inputs (§3). Play time was the missing
  input and is now in the catalog (#79).

It's a front-end pass on the data paths the prototype already has. The one route change is
retiring `/discover` into this page.

## 1. The page

### Start

One headline, and a large **SegmentedControl** with the two ways in: **I want games like… |
Help me find a game** (boards 4 and 5).

**I want games like…** (board 4):

- a large `GameSearch` (the `onpick` variant);
- **Or start from your shelf:** six of your highest-rated owned games as compact
  **GameTiles** (thumbnail, name, year). They rise in once on load, 70 ms apart, and not at
  all under `prefers-reduced-motion`. Hidden without a collection.

**Help me find a game** (board 5), which is Discover folded in:

- `DialStrip`'s questions, with a new first question, **Where from?**, whose answers are the
  same three pools as the results sentence (Anywhere / My shelf / Games I don't own). It
  replaces the prototype's "Only games on my shelf" checkbox. Without a collection the
  question doesn't show.
- **Pick one for me** (primary): a random pick from the 100 best-rated matches, shown in a
  **GameHero** with no seed (so no match badge and no why), with Another one / More like
  this / Open game.
- **See all matches** (outline): Discover's current results list, in place, under the
  questions.
- `/discover` redirects here with Help me find a game selected and its Scope params carried
  over. Discover leaves the Games menu.

### Results (a seed is set)

The question, and nothing else, heads the page:

> Games like **[thumb · Brass: Birmingham · change]** from **[my shelf | games I don't own | anywhere]**

with one **Surprise me** button (outline) under it.

- `change` returns to Start. The seed's thumbnail links to its game page, which replaces
  the separate "Open game" link.
- **The pool is the reader's choice, and the collection is an option, never the default**
  (Phil, 2026-09-30). The page opens on `anywhere`; `my shelf` and `games I don't own` are
  there when a collection is linked (without one the pool control doesn't show). Whatever you
  last picked stays picked as you walk. The page never chooses the pool from what it knows
  about the seed.
- **The answer is stacked sections, never side by side** (board 6):
  - when the answer comes from the precomputed lists (every case except `my shelf`):
    **Recommended**, **Most similar**, **Dark horses**, in that order, each with the game
    page's one-line blurb, the top 4 as GameTiles, and **All 10** to expand that section;
  - `my shelf` has one list (the collection artifact), so one section (board 7).
- **Walking:** a tile links to this page with that game as the seed. A small breadcrumb of
  the trail shows once you've walked a step.
- **Why:** each tile's one-line why is a button that opens the full panel under that
  section (board 7).

### Surprise me (board 8)

An action, not a mode: it opens a **GameHero** above the sections, closed with ×. It shows
the pick's art, name, year, match and rating badges, and shelf status, with **Another one**
(redraw, no repeats this visit), **More like this** (the pick becomes the seed) and **Open
game ↗**, then the full why. The sections stay underneath.

It draws from a wider list than the top of the page: **Dark horses** (falling back to
Recommended if that's empty), or ranks 5–20 of the shelf list on `my shelf` (a stub until the
collection-mode profiles exist).

### URL

`?id=<seed>&from=shelf|unowned|all` carries the question, so back, forward and reload work.

**Nice-to-have:** `&pick=<id>` for an open Surprise pick (Surprise me pushes a history entry,
Another one replaces it, × removes it), and Scope params for Help me find a game, as Discover
writes them now. If `pick` complicates the build, drop it; it's not a requirement. `id`,
`from` and `pick` are unused by Scope, the map and Discover.

## 2. Where each list comes from

The page's job is to answer the question you asked; how it gets the answer never shows as
a choice or a prompt. **No "search live?" buttons.** When an answer needs the live pooled
query (about 3 s, about $0.0005), the page runs it and shows the same loading state as any
other list.

"Artifact" means the per-collection neighbours table in DuckDB; `/api/similar` is the
warehouse endpoint.

| Seed | `my shelf` | `games I don't own` | `anywhere` |
| --- | --- | --- | --- |
| on your shelf | artifact **A** | artifact **C** | `/api/similar?pool=all` (precomputed `game_neighbors`) |
| near-miss (a **D** seed) | artifact **D** | `pool=all` minus owned | `pool=all` |
| anything else | live `pool=collection` | `pool=all` minus owned | `pool=all` |

- **"Minus owned"** filters the precomputed top 10 in the browser. If fewer than 3 are left,
  the page runs the live `pool=exclude` query instead (the `exclude_collection` pool Phil
  wanted kept).
- **What each list shows.** Catalog lists (C, `pool=all`, live `exclude`) carry all three
  styles; shelf lists (A, D, live `collection`) have one plain-similarity list until the
  collection-mode profiles exist.

  | List | Sections | Surprise me draws from |
  | --- | --- | --- |
  | catalog (C, `pool=all`, `exclude`) | Recommended, Most similar, Dark horses (each top 4, All 10) | `sicko`, falling back to `recommender` if `sicko` is empty |
  | shelf (A, D, `collection`) | one section, ranks 1–10 | **stub:** ranks 5–20 of the same list |

  The shelf row is the seam for step 2: the collection-mode profiles replace it without
  touching the UI.
- A section that comes out empty (for example after removing owned games) is left out rather
  than shown empty.

## 3. Why are these similar? (level 1)

Computed **client-side** from the two catalog rows (seed and candidate). No new data. Order
as Phil set it: complexity, player count, play time, then shared mechanics, categories and
families.

| Trait | Source columns | Reads as |
| --- | --- | --- |
| Complexity | `predicted_complexity` (decided: the "why" shows the data that drives the comparison) | both within 0.5 → "both ~3.8"; else "3.8 vs 2.9" |
| Players | box `min_players`–`max_players`, **not** best-at votes | overlap → "both play 2–4"; none → "1–2 vs 3–6" |
| Play time | `min_playtime`–`max_playtime` | as players, formatted with `formatMinutes`; missing on either → omitted |
| Mechanics | `mechanics` | shared ones, **rarest first** |
| Categories | `categories` | shared, rarest first |
| Families | `families` matching the embedding's own allowlist (below) | shared, rarest first |

- **Principle:** every trait shown is an input to the embedding, read the way the embedding reads
  it. Hence `predicted_complexity`, not BGG's `average_weight`, and box player counts, not
  best-at votes.
- **Complexity note:** the complexity row carries a short note that the model uses *predicted*
  complexity rather than BGG's community weight, so a number that differs from BGG doesn't read
  as a bug. Copy `PLACEHOLDER(Phil)`. It's a small muted line under the row in the full panel,
  left out of the one-line why.
- **Same cut as the model:** the embedding drops any mechanic, category or family on fewer
  than 10 games (`embeddings.min_feature_count: 10` in bgg-predictive-models `config.yaml`;
  mechanics and categories have no pattern filters). The page already counts tag
  frequencies, so it applies the same floor: a shared tag on fewer than 10 games isn't
  shown as a reason.
- **Rarest first:** sharing "Hand Management" says little and sharing "Network and Route
  Building" says a lot. Tag frequencies come from one DuckDB `unnest` count per column over
  the catalog at page load (~36k rows, milliseconds) and are cached for the session.
- **Families: the embedding's allowlist, not a hand-made denylist.** The structural embedding
  only sees families matching `DEFAULT_EMBEDDING_FAMILY_PATTERNS`
  (bgg-predictive-models `src/models/embeddings/transformer.py:130`):
  `^Players:`, `^Category`, `^Sports`, `^Traditional`, `^Card`, `^Collectible`. There is no
  `config.yaml` override.
  - The viewer copies those six patterns into a constant, with a comment pointing at that
    file so the two stay in sync.
  - Anything else (`Theme:`, `Components:`, `Series:`, `Country:`, `Mechanism:`, `Misc:`,
    `Admin:`, `Crowdfunding:` …) is never shown as a reason. The model doesn't see it, so
    presenting it as one would be false.
  - The model also keeps only the top 150 matching families with at least 10 games each. The
    viewer doesn't reproduce that cut, since it can't without the fitted transformer. It shows
    any shared family that matches the patterns. A rare family that falls outside the cut
    sorts last under rarest-first anyway, and the prefix filter already removes what would
    mislead.
- **Where it shows:**
  - **One-line why** on every GameTile and in the GameHero: the first two traits that match
    plus the rarest shared mechanic. For example: "Both ~3.8 · 2–4 players · Network and Route
    Building".
  - **Full panel:** in the GameHero, and under a section when a tile's one-line why (a
    button) is clicked. The three scalar rows, then shared tags as `TagChip`s, capped at 6 per
    group with "+n".
- It lives in `src/lib/recommend/why.ts`, a pure function over two rows plus the frequency
  maps, so it can be tested without DuckDB and reused later on the game page.

Level 1 only: what the two games share on the inputs. Which features *drove* the
embedding's distance (level 2) is out of scope.

## 4. Components

Built from the app's patterns and components. New components are fine, but they're **shared
components with a job beyond this page**, not one-offs styled to match a sketch. Anything that
needs a variant gets a prop on the shared component, not a local copy.

**Existing:** `Container`, `Stack`, `Split`, `AutoGrid`; `Button` (`default` for the one primary
action in a view, `outline` / `ghost` / `link` otherwise); `GameSearch`; `DialStrip`;
`SimilarRow` (lifted from the game page on this branch); `ComplexityMeter`; `TagChip` (lifted
from the game page's chip style on this branch); `similarityPct` / `similarityColor` /
`ratingColor` for badges.

**New shared:**

| Component | What it is | Who else uses it |
| --- | --- | --- |
| `SegmentedControl` (`$lib/components/ui/`) | The muted-track, raised-pill control, with `size` sm / md / lg. | The game page's similar-games switcher and `ShapeStrip`, which each carry their own copy of this look in page CSS today, move onto it. `SegGroup` stays the Explore rail's control. |
| `GameTile` (`$lib/catalog/`) | A game as a card: art, name + year, optional sim/rating badges, optional one-line slot. `compact` = art, name, year only. | The Start shelf cards use `compact`. Landing and Discover card views are candidates later. |
| `GameHero` (`$lib/catalog/`) | One game shown large: fixed 4:3 art, title, a meta line, an actions slot and a body slot, on `Split`. | The landing page's `FeaturedGame` is a candidate to adopt it. |

**Colocated (Recommend-only):** `WhyMatch.svelte`, the full why panel built from
`ComplexityMeter` + `TagChip`.

- Colors are theme tokens only (`style-rules`); state is never shown by color alone. The "on
  your shelf" marker is text.
- The one piece of motion is the Start cards' load-in; everything else moves only in response
  to an action.

## 5. Layout and states

- **Measure:** `Container size="list"`. Start is centred (it's the tool's front door); results
  are left-aligned like the rest of the app.
- **Mobile:** the sentence wraps with the pool control on its own line; tiles go from 4 across
  to 2 to 1 by container width (`AutoGrid`); the GameHero stacks via `Split`.
- **States:**
  - no collection linked: pool fixed to `anywhere`, no shelf cards, no "Where from?", one line
    pointing to Settings;
  - no artifact built for the user: same, with a line saying so;
  - loading: sections show a loading line; the live pooled query runs without a prompt;
  - empty: a section with no games is left out; if every section is empty, one line says so.
- The admin username box stays (admin only), as a small input on the Settings line.
- **Copy** is `PLACEHOLDER(Phil)` wherever the sketches invented words.

## 6. Not in this pass

- **Collection-mode profiles** (what the shelf list and Surprise rank by). This is step 2;
  §2's stub is the seam.
- **Productionizing:** the collection-neighbours Dataform model plus the `viewer-artifacts`
  export, shipping `feat/pooled-similarity`, then this branch. The artifact is still built
  by `scripts/build-collection-neighbors.ts` and read from `.cache`.
- Moving the game page's and `FeaturedGame`'s own chip copies onto `TagChip`.
- Level-2 "why", and multi-seed ("games like these three").
- The `p` URL param collision (Scope vs map) is still open and separate.

## Decisions

1. **Complexity source (2026-09-25):** `predicted_complexity`, with a UI note that it's the
   model's, not BGG's.
2. **Families (2026-09-25):** the embedding's own family allowlist, copied from
   `transformer.py`, with the model's 10-game floor but not its top-150 cut.
3. **Pool:** the reader's choice, never inferred from the seed. The page opens on `anywhere`
   (2026-09-30: the collection is an option, not the default) and remembers the last pick.
4. **The three lists (2026-09-25):** stacked as content, top 4 each, not a switch.
5. **Discover (2026-09-25):** folds in as "Help me find a game". **For now Discover also stays in
   place** (Phil, 2026-09-25): `/discover`, its Games-menu entry and the landing card are
   unchanged, and its page is built from the same `DialStrip` + `DiscoverResults`. Retiring it
   (a redirect to `/recommend?tab=find`, via `findHref`) is a later call.
6. **URL state:** the question is in the URL; `pick` is a nice-to-have.

## Build notes (2026-09-25)

Where the build differs from, or adds to, the sections above:

- **"Where from?" is the `from` param, not a Scope field.** It uses the same `from` as the
  results sentence (`all` by default on Help me find a game, `shelf` on results) and is kept out
  of `Scope` because it needs the reader's owned ids, which `toWhere` doesn't have. It's a
  `DialRow`, the row `DialStrip`'s four questions are now built from.
- **The Start tab is `?tab=find`**; no param is "I want games like…". Switching tabs starts the
  other tab clean.
- **`pick` is in the URL** for the results page's Surprise me. "Pick one for me" on Help me find
  a game keeps its pick on the page instead (it has no seed to go with it).
- **The seed in the sentence** is its thumbnail (a link to its game page) beside an outline
  Button with its name and "change", since a link can't sit inside another.
- **A tile's one-line why** ends in a small "Why?" link button, rather than the whole line being
  a button.
- **Discover's results** moved into `$lib/discover/DiscoverResults.svelte`, unchanged apart from
  taking the scope as a prop plus an extra WHERE. Its "open in Explore" door came with it.
- **Discover stays in place for now** (decision 5): nothing about `/discover` changes for
  readers. The redirect, menu removal and landing-card link were built and then reverted.
- **Extra shared pieces:** `SimBadges` (the sim/rating badges, shared by `SimilarRow` and
  `GameTile`) and `DialRow`.
- **Not done:** the game page's and `FeaturedGame`'s chip copies onto `TagChip`; `AnalysisPanel`'s
  parked segmented controls (commented out, so nothing to move).

## v3: Help me find a game's answer (2026-10-01)

Canvas boards 9 (rows) and 10 (cards). Replaces "Pick one for me → GameHero" and "See all
matches → Discover's table" above.

- **The answer shows as soon as a question is answered** (not counting "Where from?"): the top
  10 matches, top rated first, with **Show all N** under them to page in the rest. No toggle,
  no table panel, no inner scroll, no rank, no column headings, no Explore door.
- **One header line** over the answer: "Top 10 of N · top rated" on the left; the Cards | List
  setting (shared with I want games like…) and **Pick one for me** on the right.
- **Cards** (board 10, the default): `GameResult` cards in two columns — art at 96px (under the
  ~200px thumbnail, never upscaled), name (wraps) and year · two categories, chips for
  complexity, playtime and players ("Best at 2 · also 1, 3"), a rating tile, and a muted
  **More like this →**. **List** (board 9): the same facts as one line per game.
- **The pick** is a `GameResult` feature card above the header line: 168px art, "Picked for
  you", the same chips, a larger rating tile, More like this → / Another one, and ×.
- **The answers collapse** to one centred line once every question is answered — the answers
  given in the text colour, the rest muted ("any kind") — with **Change** to reopen them.
- **Orange is only for what's clickable or chosen.** Complexity, players and rating are
  neutral. A chosen "Doesn't matter" is outlined and neutral, not filled.
- **More like this** still opens I want games like… with that game as the seed; carrying the
  answers across waits on the filtered neighbours endpoint.
- `/discover` keeps its table (`GameRow`, now without the complexity bar).
