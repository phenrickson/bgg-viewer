# Recommend v2 — plan

**Spec:** `docs/superpowers/specs/2026-09-25-recommend-ui-and-why-design.md`
**Sketches:** <https://claude.ai/artifact/9ezXBApcvpu1bCPK3sDFS2> (v2 row, boards 4–8)

## Goal

Rebuild `/recommend` to the v2 spec: two ways in (Discover folded in), the pool as the only
results control, the three lists stacked as content, Surprise me as an action, and a "why" on
every match. Built from shared components, with three new ones.

**Done when** Phil has looked at each checkpoint below in `just dev` (light and dark, desktop
and a narrow window) and signed it off.

## How iteration works

- **Every step ends at a checkpoint.** I stop, say exactly what to look at and where, and
  wait. You react, I adjust on the same step, and we loop until you're happy. The next step
  doesn't start until then.
- **Small commits per round of feedback**, so any change can be reverted on its own.
- **Dials are named constants at the top of each file:** tiles per section, how many shelf
  cards, the load-in delay, and so on. A "try 3 instead of 4" is a one-line change.
- **A dev preview page, `/dev/components`,** shows the new shared components on real catalog
  games, in every size and state, side by side. That's where the tile, the hero and the
  segmented control get tuned before any page depends on them.
- **I don't drive a browser.** You're looking at the app; I'll ask for a screenshot if I need
  to see something.
- **Copy stays `PLACEHOLDER(Phil)`**, and never blocks a checkpoint.

## Branches and PRs

| PR | Branch | From | Contents | Can merge when |
| --- | --- | --- | --- | --- |
| 1 | `feat/shared-game-components` | `main` | `SegmentedControl`, `GameTile`, `GameHero`, the `SimilarRow` and `TagChip` extractions, `/dev/components`, and the game page + `ShapeStrip` moved onto `SegmentedControl` | After checkpoint 1. It stands alone: nothing in it needs the warehouse endpoint. |
| 2 | `feat/recommend-tool` | rebased onto PR 1 | The Recommend page (steps 2–5) and the Discover merge | After `feat/pooled-similarity` ships in the warehouse and the collection-neighbours artifact is productionized (spec §6). Until then it's local. |

The existing `SimilarRow` / `TagChip` commits on `feat/recommend-tool` move into PR 1
(cherry-picked), and `feat/recommend-tool` is rebased onto it. I'll ask before each of those
branch moves.

## Steps

### 1. Shared components → checkpoint 1 (PR 1)

- `SegmentedControl` in `$lib/components/ui/segmented-control/`: `options`, `value`,
  `onchange`, `size` sm / md / lg, `aria-pressed` buttons in a labelled group. Tokens only.
- Move the game page's similar-games switcher and `ShapeStrip`'s `.seg` onto it, deleting
  their page CSS copies. Both must look unchanged.
- `GameTile` in `$lib/catalog/`: `href`, `name`, `year`, `thumbnail`, optional `similarity`
  and `rating` (the same badges as `SimilarRow`, shared through one small `SimBadges` piece
  so the two can't drift), an optional `line` snippet, and `compact`.
- `GameHero` in `$lib/catalog/`: art (fixed 4:3, `contain`), title, `meta`, `actions` and
  `body` snippets, on `Split`.
- `SimilarRow` and `TagChip`, cherry-picked from the Recommend branch.
- `/dev/components` (local dev only: a 404 in production via `if (!dev) error(404)`, like
  `/dev/similar` and `/dev/vizzes`): each component in each
  size and state, on a few real catalog games (thumbnail present and missing, long and short
  names).

**Verify:** `just check`, `just test`; component tests where there's logic (option selection,
compact vs full). **Checkpoint 1:** you look at `/dev/components`, the game page's switcher
and the Explore shape strip, in light and dark. The shape and density of the tile, hero and
segmented control get settled here.

### 2. Results page → checkpoint 2

- Rewrite `/recommend` results on the shared components: the question sentence (the seed
  button and the pool `SegmentedControl`, size md), then the stacked sections (Recommended / Most similar /
  Dark horses, top 4 GameTiles each, All 10), or one section for `my shelf`.
- Reuse what's already built and tested: `sources.ts` (routing, gains a `sectionsFor` that
  replaces `listFor`'s modes), `why.ts`, the list loading and hydration.
- The tile's one-line why as a button that opens `WhyMatch` under its section.
- The URL: `id` and `from`. Walking by tile link. A breadcrumb after the first step.

**Verify:** `sources.test.ts` updated for sections, `just check`, `just test`.
**Checkpoint 2:** Brass: Birmingham (on your shelf) and a game you don't own, across all three
pools, with the "why" opened on a couple of tiles. Needs `DEV_BGG_USERNAME=phenrickson` for the
shelf pools, and the local warehouse API (`uv run --extra api uvicorn
services.warehouse_api.main:app --port 8080` on `feat/pooled-similarity`) for the live cases.

### 3. Surprise me → checkpoint 3

- The Surprise me button under the question opens a `GameHero` above the sections, with
  Another one / More like this / Open game / ×, and the full `WhyMatch` as its body.
- Draws per spec §2 (Dark horses, or shelf ranks 5–20), without repeats this visit.
- **Nice-to-have:** `pick` in the URL (push on open, replace on redraw, remove on ×). If it
  fights the rest, I'll tell you and leave it out.

**Verify:** a unit test for the draw (no repeats, fallback when Dark horses is empty).
**Checkpoint 3:** open, redraw, More like this, ×, Back.

### 4. Start, games like → checkpoint 4

- The headline and the Start `SegmentedControl` lg (I want games like… | Help me find a game).
- `GameSearch`, then six shelf `GameTile`s (`compact`), highest-rated owned games, with the
  one load-in: rise 420 ms, 70 ms apart, off under `prefers-reduced-motion`.

**Verify:** `just check`. **Checkpoint 4:** the Start screen with and without a collection,
and with reduced motion on.

### 5. Help me find a game (Discover folds in) → checkpoint 5

- The second Start tab: `DialStrip` with a new first question, **Where from?** (Anywhere / My
  shelf / Games I don't own; hidden without a collection). It's a Scope-level answer, so it
  round-trips in the URL like the other questions.
- **Pick one for me** → a `GameHero` with no seed. **See all matches** → Discover's results
  list, moved here from `routes/(app)/discover/+page.svelte` into a component both can use
  during the switch.
- `/discover` → a 308 to `/recommend` with the Help me find tab and its Scope params, the same
  shape as the `/dev/map` redirect. Discover leaves the Games menu; the landing page's links
  to it are updated.

**Verify:** `scope.test.ts` for the new question's round-trip, a route test for the redirect
(like `map/route.test.ts`), `just check`, `just test`. **Checkpoint 5:** the questions, Pick
one for me, See all matches, and an old `/discover?…` link landing in the right place.

### 6. Tidy and hand-off

- Delete the leftovers of the first build (the old page parts, unused CSS).
- Confirm each spec section against what's built and list any drift for you.
- Update the spec's status. PR 2 stays local until the warehouse side ships.

## Risks

- **`ShapeStrip` and game-page regressions** from moving them onto `SegmentedControl`. They're
  checked at checkpoint 1, and PR 1 can be reverted on its own.
- **Folding Discover in** touches the nav and the landing page. It's the last step so
  everything before it is unaffected; rollback is reverting that step's commits.
- **The live pooled cases** need the local warehouse API running. Without it, those cases
  show their error state, which is itself worth seeing once.
- **The `p` URL collision** (Scope vs map) is untouched here; the new params don't add to it.

## Out of scope

Collection-mode profiles; productionizing the collection artifact and the pooled endpoint;
moving the game page's and `FeaturedGame`'s chip copies onto `TagChip`; level-2 "why";
multi-seed.
