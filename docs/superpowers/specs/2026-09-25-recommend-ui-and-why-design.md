# Recommend: one question, one answer, and why — design

**Date:** 2026-09-25
**Status:** Agreed with Phil 2026-09-25; building
**Branch:** `feat/recommend-tool` (local; rebased on `main` at 0.0.25)
**Related:** bgg-data-warehouse `docs/superpowers/specs/2026-09-24-pool-similarity-and-collection-neighbors-design.md`
(the pooled endpoint and the per-collection artifact); sketches at
<https://claude.ai/artifact/9ezXBApcvpu1bCPK3sDFS2> (Start · Best match · Surprise me).

## Why

The `/recommend` prototype works but shows everything at once: two side-by-side panels, a
style switcher, a source label per list. The sketches replace that with **one question and
one answer**: the options you pick decide which single list you see. And a list of names
with a match percentage doesn't say *why* a game is there; the "why" is what makes a
recommendation trustworthy. Play time was the missing piece for it and is now in the catalog
(#79).

This is a front-end pass. It uses the data paths the prototype already has and changes no
back end.

## 1. The page

### Start (no seed yet)

As the Start sketch:

- **"Games like…"**: a large `GameSearch` (the `onpick` variant). Below it, a few
  **shelf chips**: your highest-rated owned games, for one-click seeds. Hidden without a
  collection.
- **or Surprise me**: one primary button, plus **Only games on my shelf** (a checkbox,
  disabled without a collection) and **Narrow it down ▾**, which opens Discover's
  `DialStrip`, collapsed by default. It picks at random from the 100 best-rated games that
  match, as the prototype does now, and lands on the Surprise result view with that game as
  the answer.

### The question (a seed is set)

One sentence replaces the panels and the trail header:

> Games like **[Great Western Trail · change]** from **[my shelf | games I don't own | anywhere]**

with a **Best match | Surprise me** segment under it and one line of context ("From your
162 games").

- `change` returns to Start.
- **The options are the interface.** The pool and the mode are choices you make in the
  sentence; the page never picks them from what it knows about the seed. It opens on
  `my shelf` + `Best match`, as the sketch does (`anywhere` without a collection, where the
  pool choice doesn't show and the sentence ends at the seed). After that, **whatever you
  last picked stays picked** as you walk from game to game.
- The walk stays: clicking a result makes it the seed. The trail shrinks to a small
  breadcrumb above the sentence, and only shows once you've walked at least one step.

### Best match

As the Best match sketch: the **top 3 as cards** (box art, name, year, match, one-line why),
then **"Also close"**, ranks 4–10 as compact rows. Each card and row carries an
**on your shelf** marker where it applies (pool `anywhere`).

### Surprise me

As the Surprise sketch: **one game**, shown large with "Try", its match to the seed and the
why. Actions: **Another one** (redraw, never repeating in this session), **More like this**
(the pick becomes the seed, back on Best match), **Open game ↗**. Under it, **"Also in the
draw"** lists the rest of the list it drew from.

**Surprise draws from a different, wider list than Best match, not a re-roll of Best
match.** Which list depends on the pool (§2).

### URL

`?id=<seed>&from=shelf|unowned|all&mode=best|surprise`, so back, forward and reload work
and a result can be linked. No collision with `Scope` or map params (`id`, `from`, `mode`
are unused by either).

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
- **Best match vs Surprise me.** Catalog lists (C, `pool=all`, live `exclude`) carry all three
  styles, so the two modes map onto them. Shelf lists (A, D, live `collection`) have one
  plain-similarity list until the collection-mode profiles exist.

  | List | Best match | Surprise me draws from |
  | --- | --- | --- |
  | catalog (C, `pool=all`, `exclude`) | `recommender` | `sicko` (Dark Horses), falling back to `recommender` if `sicko` is empty |
  | shelf (A, D, `collection`) | plain similarity, ranks 1–10 | **stub:** ranks 5–20 of the same list |

  The shelf row is the seam for step 2: the collection-mode Recommend and Surprise profiles
  replace both cells without touching the UI.
- The style switcher (similar / recommender / sicko) leaves this page. It stays on the game
  page.

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
  as a bug. Copy `PLACEHOLDER(Phil)`. Placement default: a small muted line under the row in the
  full panel, left out of the one-line why.
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
  - **One-line why** on each Best-match card and on the Surprise pick: the first two traits
    that match plus the rarest shared mechanic. For example: "Both ~3.8 · 2–4 players ·
    Network and Route Building".
  - **Full panel** under the Surprise pick, and on a card behind a **Why?** disclosure: the
    three scalar rows, then shared tags as chips, capped at 6 per group with "+n".
- It lives in `src/lib/recommend/why.ts`, a pure function over two rows plus the frequency
  maps, so it can be tested without DuckDB and reused later on the game page.

Level 1 only: what the two games share on the inputs. Which features *drove* the
embedding's distance (level 2) is out of scope.

## 4. Built from what's already there

No hand-rolled controls. The sketches set the arrangement; every piece comes from a
component or pattern the app already uses. The prototype's local `.seg`, `.modes`,
`.primary`, `.link` and `NeighbourList` styles all go.

| Piece | Reuses |
| --- | --- |
| Page shell, title, lede | `Container size="list"` + the Discover page's `h1` / `.lede` treatment, so one measure and one left edge |
| Vertical rhythm | `Stack` (`$lib/components/ui/layout`) |
| Seed search | `GameSearch` (the `onpick` variant already on the branch) |
| Shelf chips, pool choice, Best match / Surprise me | `SegGroup` (`$lib/catalog/rail/SegGroup.svelte`), the house segmented control. Its doc comment says a hand-rolled choice control is the tell to avoid |
| Surprise me, Another one, More like this, Why?, live-search offer | `Button` (`$lib/components/ui/button`): `default` for the one primary action per view, `outline` / `ghost` / `link` for the rest |
| Narrow it down | `DialStrip` as-is |
| Best-match top 3 and the Surprise pick | `GameCard` (`$lib/catalog/GameCard.svelte`), the shared art / identity / stats shell. Thumbnails come from the `thumbnails` table, as Explore does |
| Also close / Also in the draw rows | Discover's `GameRow` if its props fit a match % in place of rank. Otherwise extend `GameRow` with an optional stat snippet rather than writing a third row component |
| Match % | `similarityPct` / `similarityColor` from `$lib/game/similarity`, the game page's "sim" badge, so a match reads the same on both pages |
| Complexity in the why panel | `ComplexityMeter` for both games, side by side |
| Shared tags | The chip look `FilterChips` already uses (tokens, radius), as read-only chips |

- If a piece needs a variant, add it to the shared component (a prop), not a local copy.
  `WhyMatch.svelte` is the only new component. It's colocated with the route, since only
  this page uses it until the game page does.
- Colors are theme tokens only (`style-rules`); status is never shown by color alone. The
  "on your shelf" marker is text.

## 5. Layout and states

- **Mobile:** everything stacks. The sentence wraps, with the pool as a segmented control on
  its own line. Cards become rows at narrow widths.
- **States:**
  - no collection linked: pool fixed to `anywhere`, shelf chips hidden, one line pointing to
    Settings;
  - artifact missing for the user: same as no collection, with the prototype's message;
  - loading;
  - empty list;
  - live search offered or running.
- The admin username box stays but moves behind the `Collection:` line (admin only).
- Theme tokens only, light and dark, per `style-rules`.
- **Copy** is `PLACEHOLDER(Phil)` wherever the sketches invented words, including the
  sentence, the section labels and the lede.

## 6. Not in this pass

- **Collection-mode profiles** (what Best match and Surprise me rank by on a shelf). This is
  step 2; §2's stub is the seam.
- **Productionizing:** the collection-neighbours Dataform model plus the `viewer-artifacts`
  export, shipping `feat/pooled-similarity`, then this branch. The artifact is still built
  by `scripts/build-collection-neighbors.ts` and read from `.cache`.
- Level-2 "why", and multi-seed ("games like these three").
- The `p` URL param collision (Scope vs map) is still open and separate.

## Open for Phil

1. ~~Complexity source~~: **decided (2026-09-25)**, `predicted_complexity`, with a UI note that
   it's the model's, not BGG's.
2. ~~Family denylist~~: **decided (2026-09-25)**. Use the embedding's own family allowlist,
   copied from `transformer.py`, with the model's 10-game floor but not its top-150 cut.
3. ~~Default pool per seed~~: **dropped**. The pool is the reader's choice; the page opens on
   `my shelf` + `Best match` and remembers the last pick (§1).
