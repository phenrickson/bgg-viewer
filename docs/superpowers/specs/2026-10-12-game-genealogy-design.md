# Game genealogy — v1 design

**Date:** 2026-10-12
**Status:** Design agreed, ready to plan
**Branch:** `feat/game-lineage` → one PR to `main` (spec, plan and implementation together)

## Problem

The embedding tells us which games are alike, but not how a design moved through time. Pick
Caverna and you should see where it came from (Agricola, and Caylus behind that) and what came
after it (A Feast for Odin and the rest). Across many games, two traits stand out:

- **Precedent:** how much close, earlier design a game had. An early Unlock box has almost
  none, so it reads as an origin.
- **Following:** how much close, later design came after it. Gloomhaven and Unmatched
  produced a flurry.

This isn't a designer's career or a franchise list. Designer, family, series and
implementation already feed the embedding, so they count through similarity like everything
else. The point is **a game's place in time inside its similarity neighbourhood**.

v1 is a one-game tool: choose a game, see its tree, and explore it. A catalog-wide view of
which games are origins and which spawned flurries is deferred (see *Not doing*).

## What the genealogy is

`buildGenealogy` is a pure function. It takes the L2-normalised vectors, years, family ids,
related ids and the settings, and returns a tree. It knows nothing about rendering.

- **Link:** games A and B are linked when their cosine similarity is at least the
  **threshold**. The threshold is an absolute value exposed as a slider: a tuning parameter
  to explore with, not a fixed rule. Its default is picked from the first real trees.
  There's no popularity floor; obscure games are part of the story upstream and
  downstream. Ratings are *shown* (node size), never used to filter.
- **Direction from year:** a **parent** is a linked game published strictly earlier; a
  **child** is one published strictly later.
- **Contemporaries:** linked games from the *same* year as the chosen game sit on its row.
  They are shown but can't be unfolded.
- **Chained:** a parent's parents are found from that parent (linked to it and earlier
  than it), with no comparison back to the chosen game. A genealogy can drift into another
  genre several generations out, and that drift is part of the story.
- **Two trees, one direction each:** ancestors only unfold upward and descendants only
  unfold downward. Agricola's other children (Caverna's siblings) appear when you re-centre
  on Agricola, not when you unfold it.
- **Each game appears once:** if a game is already in the tree, unfolding another game
  doesn't add it again. It stays attached to the game it was first reached through.
- **Grow on demand:** the tree starts one generation each way. Unfolding a game reveals its
  strongest **m** (default 8) parents or children, plus a **"+N more"** stub that reveals
  the rest. The stub's count is the flurry signal even when it's collapsed.
- **Link type**, from data the dev dataset already carries:
  - *reimplementation or expansion*: the pair are linked through `related_ids`
    (`core.game_implementations`, `core.game_expansions`);
  - *same family*: they share a `Game:` / `Series:` family (`family_ids`);
  - *influence*: neither applies, so the link is similarity only.

  If both of the first two apply, it counts as a reimplementation or expansion.
- **Eligibility:** every working-set game (rated ≥ 30, or upcoming) that has a vector and a
  year. Upcoming games are in the tree as descendants. Games with no year (about 244) can't
  be placed in time, and they already lack embeddings.

## The page: `/dev/genealogy`

Named *genealogy*, not *lineage*: `/admin/lineage` is already the data-pipeline lineage
page.

Dev-gated (`if (!dev) error(404)`) like the other `/dev` pages until it's promoted. All tree
state is in the URL — `?game=<id>&t=<threshold>&y=year|gen&u=<unfolded ids>&a=<expanded
id:dir>&trail=<previous centres>` — so a tree can be linked and the back button restores it.

**Layout: top-down.** Ancestors sit above, the chosen game and its contemporaries in the
middle, descendants below, and you pan vertically. A **Year | Generation** segmented control
(`SegGroup`) sets what y means:

- **Year:** y is the publication year, so a long edge is a long gap and a flurry is a dense
  band just below its parent.
- **Generation:** rows −k … 0 … +k, evenly spaced, with the year on each label.

Within each half, x comes from a tidy-tree spread, so a game's children sit under it and
links cross as little as possible.

**Encoding:**

| Mark | Means |
|---|---|
| Node size | Number of ratings, on a log scale |
| Accent colour | The chosen game |
| Ring | The selected game |
| Hollow, dashed node | An upcoming game |
| Link thickness | Similarity between the two games |
| Solid / dashed / marked link | Influence / same family / reimplementation or expansion |
| ⊕ on a node | Unfold in its direction |
| "+N more" stub | Weaker links hidden by the cap |

**Interaction:**

- Clicking a game **selects** it. A non-modal side panel (an `<aside>`, as `/map` uses; `Sheet` is modal and would block the tree) shows its facts, the similarity and
  type of the link that brought it in, **Centre on this**, and its game page link.
- **⊕** unfolds, and **+N more** expands.
- **Centre on this** pushes a breadcrumb (Caverna › Agricola › Caylus) and a history entry.
  Back restores the previous tree as it was, including what you had unfolded.
- Changing the **threshold** rebuilds from the centre and keeps unfolded games where they
  still qualify.
- A half with nothing above the threshold shows a quiet line ("No earlier games above this
  similarity"). A thin tree is an answer, not an error.

All copy is PLACEHOLDER; Phil writes the copy.

## Architecture

Renderer: **`PointCanvas` + a new `GenealogyLayer`**, the regl path the ego network uses, not
Sigma. Positions come from the genealogy layout rather than a force simulation. The shared
canvas keeps flying from the map open as a follow-up.

| Unit | Does | Depends on |
|---|---|---|
| `src/lib/map/genealogy.ts` | `buildGenealogy` (state in: centre, threshold, cap, unfolded set, expanded set → tree out; recomputed whole on every change, so a threshold move keeps whatever still qualifies), `linked` (threshold scan, a sibling of `topK`), `linkKind`; appear-once; cap and overflow | `dot` from `network.ts`; vectors, years, `family_ids`, `related_ids` |
| `src/lib/map/genealogy-layout.ts` | `layoutGenealogy`: tree → positions in the `NetworkLayout` shape; Year/Generation y; tidy x per half; contemporaries on the centre row | genealogy tree, years |
| `src/lib/map/GenealogyLayer.svelte` | Draws nodes and edges with the encodings above; reports picks and hovers | `useSurface`, regl edge geometry, `ink.ts`, `palette.ts` |
| (inside `GenealogyLayer`) | ⊕ and "+N more" as HTML buttons positioned from the overlay's screen positions; axis ticks painted on the overlay canvas | `OverlayApi.screen` |
| `src/routes/(app)/dev/genealogy/+page.svelte` (+ `+page.server.ts` dev gate) | Loading, game search (`GameSearch` gains an `onpick` prop), controls, URL state, breadcrumb, side panel | all of the above, catalog |

It is a sibling of `NetworkLayer` rather than `NetworkLayer` with options, because hop rings,
the category colour and mutual or one-way edges don't apply here.

**Data flow:** on mount, load the catalog, the coordinates artifact and the dev similarity
dataset. `network-data.ts` also reads `family_ids` and `related_ids`. Genealogy then runs
entirely in the browser: `buildGenealogy` → `layoutGenealogy` → `GenealogyLayer`. Unfolds and
threshold changes are recomputed locally, about 2 ms per full scan, memoised per game and
threshold. There are no server calls after load.

**Artifact freshness:**

- `PointCanvas` indexes by the coordinates artifact, and `loadNetworkData` silently drops
  any game missing from it. A stale coordinates artifact therefore hides newer games
  without any error.
- The dev dataset gains an `embedding_version` schema-metadata key, as the coordinates
  artifact already has.
- The loader compares the two and shows an error on a mismatch instead of drawing a
  partial tree.

## Testing

- `genealogy.test.ts`, on small synthetic vector sets: direction by year; contemporaries;
  chained unfold not checked against the centre; appear-once; cap and "+N more" count; link
  type precedence; empty halves; ineligible (no-year) games excluded.
- `genealogy-layout.test.ts`: Year mode puts y in year order; Generation mode spaces rows
  evenly; children sit under their parent; contemporaries are on the centre row.
- A loader test: mismatched embedding versions raise an error.
- The page is reviewed live on Phil's dev server.

## Delivery

1. **Step zero:** regenerate the stale dev similarity dataset (`just similar-rebuild`; it
   predates the latest data). Confirm with Phil before running. The coordinates artifact is CI-built on the GCS rail; the version check reports if it lags.
2. Build on `feat/game-lineage`, committing and pushing tested work as it lands.
3. One PR to `main` with the spec, plan and implementation. Phil merges.

## Not doing (v1)

- **Per-game genealogy API** and a genealogy view on the game detail page. This is the next
  step; `buildGenealogy` is kept pure so a server endpoint can reuse it.
- **A public vectors artifact.** Shipping beyond `/dev` needs the 64-d vectors in
  production (about 2.3 MB if quantised to int8, lazy-loaded like the coordinates). That
  gets its own spec when the page is promoted.
- **Flying from the map:** picking a game on `/map` and having its genealogy fly into tree
  positions.
- **A catalog-wide origin/flurry overview:** ranking or plotting every game by precedent vs.
  following. Any such score would also need adjusting for a game's age, since recent games
  haven't had time to gather a following.
- **Drift shading:** fading games by their similarity to the chosen game. Chained links
  were chosen without it.
