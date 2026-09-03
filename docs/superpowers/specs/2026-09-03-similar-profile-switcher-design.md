# BGG Viewer — Similar-games profile switcher (game detail) — Design

**Date:** 2026-09-03 (revised same day — see "Revision" below)
**Status:** Draft — spec for handoff. Not started.
**Depends on:** `analytics.game_neighbors` three-profile deploy (bgg-data-warehouse
PRs #105 / #107) and the warehouse-API `?profile=` change (#108) — all merged and live
as of 2026-09-03. **This spec now also requires a further warehouse change** (all three
neighbour lists in the game document — see Decision 2); it is no longer bgg-viewer-only.
**Sibling:** `2026-09-02-similar-neighbor-diversity-design.md` (the `/dev/similar`
tuning bench those profiles were tuned in — dev-only, already shipped).

> Copy note: every user-facing label below is **placeholder**. Phil writes the final copy.

## Revision (2026-09-03)

The first draft had the switcher re-run the page `load` on every click, refetching the
whole game document to change one list (old Decision 2). Rejected in review as wasteful.
The switcher now relies on the **warehouse returning all three neighbour lists in the
game document**, so switching is pure client-side state with no fetch. This moves work
into a bgg-data-warehouse PR that lands first. Decisions 2–5 rewritten accordingly.
Also settled in review: low-rating games **disable** the unavailable tabs (Decision 4);
the URL always carries an explicit `?profile=` (Decision 1).

## Goal

On the game detail page, let the reader switch the "Similar games" card between the
three precomputed neighbour lists the warehouse serves, instead of always showing the
one default list.

Success: on `/games/13`, a control above the Similar card flips it between "Similar",
"Recommended", and "Sicko" (placeholder labels); the URL reflects the choice so it's
shareable; first paint is server-rendered with the chosen list; switching is instant
(no network); offline the control is absent and the card behaves exactly as today.

## What already exists (the contract this spec consumes)

`analytics.game_neighbors` holds **three profiles**, one row per `(profile, game_id)`,
each row an `ARRAY<STRUCT<game_id INT64, name STRING, year_published INT64, distance FLOAT64>>`
plus the tuning params. There is **no `default` profile** — the default name is `similar`.

| API name | What it is | Computed for |
| --- | --- | --- |
| `similar` | Pure embedding similarity, source-relative complexity band ±0.75, capped at 1 per product line. The literal "most like this." **The default.** | every game |
| `recommender` | `similar` + a geek-rating-percentile floor (≥ p75) on candidates. "Similar, and generally well-regarded." | every game (bar the rare unrated one) |
| `sicko` | Similarity↔rating blend (0.7), **no complexity band**, 1 per product line. Leans on what the hobby rates highly and ignores weight. | only games with **≥ 30 ratings** |

Warehouse endpoints (gated Cloud Run, server-to-server only — the viewer's
`src/lib/server/warehouse` client already attaches the ID token):

- `GET /games/{id}` — full game document. **Today:** `?profile={name}` picks which single
  list the `similar` block carries (default `similar`, unknown → 400). **After this spec's
  warehouse PR:** the document carries *all three* lists (see Decision 2); `?profile=`
  stays accepted but is no longer how the viewer gets the lists.
- `GET /games/{id}/similar?profile={name}` — just one neighbour array. Unchanged; still
  used by `/dev/similar`. Not used by this feature.

**Low-rating games:** `sicko` (and `recommender` for the rare unrated game) has no row
for a game below its source-rating floor, so that profile's list is `[]`. Normal
outcome, not an error — the UI disables that tab (Decision 4).

## Current state on the page

- `src/routes/(app)/games/[id]/+page.server.ts` `load` → `warehouseClient().getGame(id)`
  → `toViewModel` maps `doc.similar` to `g.similar` (`{ id, name, year, similarity }`),
  `similarity = 1 - distance`.
- `+page.svelte` renders the "Similar games" card (~L626–655): a list of `<a>` rows,
  thumbnail (from `fetchThumbnailMap`, fire-and-forget) or initial, name + year, and a
  similarity-% badge coloured by `similarityColor`.
- Offline (`data.offline`): `g.similar` is `[]`, card shows the offline message.
- `src/lib/server/warehouse/client.ts` `getGame(gameId)` → `GET /games/{gameId}`, maps
  404 → `GameNotFoundError`, other non-2xx → `WarehouseError`.

## Decisions

### 1. `?profile=` is a URL search param, always explicit

`/games/13?profile=sicko`. `load` reads `url.searchParams.get('profile')`, validates it
against `SIMILAR_PROFILES`, and returns the resolved profile in the payload. The switcher
keeps an explicit `?profile=similar` in the URL even for the default state (Phil's call —
every state looks the same in the URL). A bare `/games/13` with no param is still valid
and renders `similar`; it is not force-redirected.

Rationale: SSR-correct first paint, shareable/bookmarkable, back/forward for free.

### 2. The warehouse returns all three lists; the switcher is client-side state

**Warehouse PR (lands first):** `readers/games.py` `get_game` attaches every profile's
neighbour list to the document, not just one. Shape (warehouse PR's exact call, but the
viewer expects): keep `similar` as the default list for back-compat, add

```jsonc
"similar_profiles": {
  "similar":      [ {game_id, name, year_published, distance}, … ],
  "recommender":  [ … ],
  "sicko":        [ … ]   // [] when the game is below the profile's floor
}
```

One `SELECT profile, similar FROM game_neighbors WHERE game_id = @id` (≤ 3 rows) replaces
the current single-profile lookup — same partition, negligible extra bytes/latency. The
document grows by ~2 KB (two short arrays).

**Viewer:** `toViewModel` maps all three into
`g.similarByProfile: Record<SimilarProfile, SimilarGame[]>`. The card renders
`g.similarByProfile[active]`. `active` is `$state`, seeded from `data.profile`. Clicking a
tab sets `active` and rewrites the URL with a **shallow** `replaceState('?profile=' + name)`
(via `$app/navigation`) — no `goto`, no `load` re-run, no fetch, no scroll jump. Reload
re-reads the param in `load` and re-seeds `active`, so a shared link still works.

Rationale: switching is a display toggle over data already in hand. No new route, no new
client method, no loading/error state in the card, no thrown-away refetch.

### 3. `getGame` is unchanged

No `profile` argument. `WarehouseClient.getGame(gameId)` → `GET /games/${gameId}`, and the
document now carries all three lists. `src/lib/server/warehouse/types.ts` `GameDocument`
gains `similar_profiles`.

Single source of truth for the names in the viewer:

```ts
// src/lib/game/similar-profiles.ts
export const SIMILAR_PROFILES = ['similar', 'recommender', 'sicko'] as const;
export type SimilarProfile = (typeof SIMILAR_PROFILES)[number];
export const DEFAULT_SIMILAR_PROFILE: SimilarProfile = 'similar';
export function isSimilarProfile(x: unknown): x is SimilarProfile { /* … */ }
// PLACEHOLDER labels — Phil writes final copy.
export const SIMILAR_PROFILE_LABELS: Record<SimilarProfile, string> = {
  similar: 'Similar', recommender: 'Recommended', sicko: 'Sicko'
};
```

### 4. Low-rating games: disable the unavailable tabs

Because the document carries every list, the page knows at render time which profiles are
empty for this game. A tab whose list is `[]` renders **disabled** (`aria-disabled`,
not focusable, muted). No need to key off `g.ratings` — the empty list *is* the signal,
and it's correct for `recommender` (percentile floor) as well as `sicko` (≥ 30 ratings).

If the reader lands on `/games/13?profile=sicko` for a game where `sicko` is empty, `load`
falls back to `DEFAULT_SIMILAR_PROFILE` and returns that; the Sicko tab shows disabled.

### 5. Unknown / malformed `?profile=` in the URL

`load` resolves `url.searchParams.get('profile')`: if it isn't in `SIMILAR_PROFILES` (or
its list is empty for this game), use `DEFAULT_SIMILAR_PROFILE`. Render the default list,
leave the junk param in the URL — it's an error path a normal reader never hits, and a
redirect isn't worth the round-trip. The warehouse `400` path for `?profile=` is now only
reachable by a direct API poke and is not this feature's concern.

### 6. Offline: no switcher

`data.offline` is true → the profile control is not rendered. Offline `g.similarByProfile`
is absent / all-empty; the card shows its existing offline message.

### 7. Placement & form of the control

A segmented control / tab row directly above the "Similar games" card heading, right
column. Three options, placeholder labels "Similar" / "Recommended" / "Sicko". Follows
the existing `.sub` / card rhythm — not a heavyweight `Tabs` component. Light + dark.
CSS-variable tokens only. Exact styling is Phil's call; `frontend-patterns` +
`style-rules` govern.

## Affected files

### bgg-data-warehouse (PR 1 — lands first)

| File | Change |
| --- | --- |
| `src/warehouse/readers/games.py` | `get_game` attaches all three neighbour lists. New `_similar_all_profiles(game_id, client)` — one `WHERE game_id =` query returning `{profile: [...]}`, missing profiles → `[]`. Keep `similar` (default list) for back-compat; add `similar_profiles`. `?profile=` still selects the top-level `similar` block. |
| `services/warehouse_api/routers/games.py` | Response now includes `similar_profiles`. `?profile=` behaviour unchanged (still 400 on unknown). |
| `tests/test_games_reader.py` | `get_game` returns all three lists; a game below the `sicko` floor → `similar_profiles.sicko == []`; unknown `?profile=` still `ValueError`. |
| API response model / schema, if one is declared | add `similar_profiles`. |

### bgg-viewer (PR 2)

| File | Change |
| --- | --- |
| `src/lib/game/similar-profiles.ts` | **new** — `SIMILAR_PROFILES`, `SimilarProfile`, `DEFAULT_SIMILAR_PROFILE`, `isSimilarProfile`, `SIMILAR_PROFILE_LABELS`, `resolveSimilarProfile(raw, availability)`. |
| `src/lib/game/similar-profiles.test.ts` | **new** — guard + resolver (unknown → default; empty-for-this-game → default; known+available passes through). |
| `src/lib/server/warehouse/types.ts` | `GameDocument` gains `similar_profiles?: Record<string, SimilarWireRow[]>`. |
| `src/lib/server/warehouse/client.test.ts` | `getGame` parses `similar_profiles` through (extend the canned `doc`). No signature change. |
| `src/routes/(app)/games/[id]/+page.server.ts` | `load({ params, url })`: `toViewModel` builds `g.similarByProfile` from `doc.similar_profiles` (fall back to `{ similar: doc.similar }` if the warehouse PR isn't deployed yet); resolve `url.searchParams.get('profile')` against what's non-empty for this game; return `profile` in the payload (online + offline). |
| `src/routes/(app)/games/[id]/+page.svelte` | Segmented control above the Similar card, `{#if !data.offline}`; `active` = `$state(data.profile)`; card renders `g.similarByProfile[active]`; tab with an empty list is disabled; `onclick` → set `active` + shallow `replaceState('?profile=' + name)`. Existing row rendering / thumbnails / `similarityColor` unchanged. |

No change to: `build.ts` / the Arrow artifact / `columns.ts` / the client catalog /
`game-from-catalog.ts` (offline stays list-less) / `serialize.ts` / `similarity.ts` /
the tuning bench / `src/lib/data/games.remote.ts`.

## Out of scope

- **A "Rating" badge on each neighbour row.** The `similar` struct doesn't carry
  `geek_rating`; adding it is its own bgg-data-warehouse PR (`game_neighbors.sqlx` +
  `readers/games.py`). When it lands, the row gains a `ratingColor(...)` badge (already
  in `similarity.ts`, unused). Not this spec.
- Any new warehouse profile, or retuning `recommender` / `sicko`.
- Live / tunable similarity on the real page (the `/dev/similar` knobs).
- Remembering the reader's last-used profile across games (localStorage). The URL param
  is the mechanism for now.
- Removing / deprecating `?profile=` on `GET /games/{id}` — it becomes redundant for the
  viewer but harmless; leave it.

## Risks / unknowns

- **Document size.** Three lists instead of one — ~2 KB on a document that already
  carries the description and embedding. Confirm the real delta once the warehouse PR is
  up; if a list is ever much longer than ~10 rows revisit.
- **Warehouse query selectivity.** Dropping `profile` from the `game_neighbors` lookup
  reads up to 3× the micro-partitions (clustered `profile, game_id`). Table is small;
  expected negligible. Check bytes-scanned in the warehouse PR.
- **Transitional deploy skew.** If bgg-viewer PR 2 ships before the warehouse PR is
  deployed, `doc.similar_profiles` is absent — `toViewModel` falls back to a single-entry
  `{ similar: doc.similar }` map, the switcher shows only "Similar" active with the other
  two disabled. Acceptable degraded state; still, land and deploy warehouse first.
- **Thumbnail map** is fetched once `onMount`, keyed by `game_id`, never re-fetched.
  Switching profile changes the id set; `thumbById` miss → initial already covers it.
  Acceptable.
- **`sicko`/`recommender` empty for a game** — Decision 4 (disabled tab). The list being
  `[]` in the document is the whole signal; no extra data needed.

## Verification

**bgg-data-warehouse:** `uv run --extra test python -m pytest tests/test_games_reader.py`;
a `bq` dry-run / manual call confirming `similar_profiles` shape and bytes scanned;
the API contract test.

**bgg-viewer:**
- `just check` — svelte-check, lint, types.
- `just test` — Vitest incl. `similar-profiles.test.ts` and the warehouse-client parse.
- `just dev`, **light + dark**:
  - `/games/13?profile=similar` — switcher on "Similar"; click "Sicko" → URL becomes
    `?profile=sicko`, list changes **instantly, no network request** (check devtools), no
    scroll jump; reload → still "Sicko"; back → "Similar".
  - A low-rating game (`users_rated` < 30) → "Sicko" tab is disabled; "Similar" works.
  - `/games/13?profile=bogus` → renders "Similar", no crash.
  - Offline (`just dev-offline`) → no switcher, card shows the offline message.
- Manual: view source on `/games/13?profile=recommender` → the recommender list is in the
  SSR HTML (first paint, no client round-trip).
