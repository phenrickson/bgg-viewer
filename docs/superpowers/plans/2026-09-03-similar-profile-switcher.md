# Similar-games profile switcher — Implementation Plan

**Date:** 2026-09-03
**Spec:** [2026-09-03-similar-profile-switcher-design.md](../specs/2026-09-03-similar-profile-switcher-design.md)
**Branches:** `feat/similar-doc-all-profiles` (bgg-data-warehouse), `feat/similar-profile-switcher` (bgg-viewer)
**Sequencing:** warehouse PR merges and **deploys** first; the viewer PR degrades gracefully if it doesn't, but real data needs it.

## Goal & success criteria

Three buttons above the "Similar games" card on the game detail page — Similar /
Recommended / Sicko — swap the list instantly with no network request, the choice lives
in `?profile=` for shareable links, first paint is server-rendered, tabs with no data for
a given game are disabled, and offline the control is absent. Done when both repos' verify
commands pass and the spec's manual scenarios check out in light and dark.

## Why two repos

The switcher is a display toggle over data the browser already holds — so the game
document has to carry all three neighbour lists. That's a `readers/games.py` change in
bgg-data-warehouse. The viewer then never fetches on toggle: no new route, no client
method, no loading state.

## Affected files

**bgg-data-warehouse:**
- `src/warehouse/readers/games.py` — `_similar_all_profiles(game_id, client)` (new); `get_game` attaches `similar_profiles` alongside the existing `similar`.
- `services/warehouse_api/routers/games.py` — response carries `similar_profiles`; `?profile=` behaviour unchanged.
- `tests/test_games_reader.py` — all three lists returned; below-floor profile → `[]`; unknown `?profile=` still `ValueError`.
- API response model, if one is declared for `/games/{id}`.

**bgg-viewer:**
- `src/lib/game/similar-profiles.ts` — **new**. Names, type, default, `isSimilarProfile`, `SIMILAR_PROFILE_LABELS` (placeholder copy), `resolveSimilarProfile(raw, available)`.
- `src/lib/game/similar-profiles.test.ts` — **new**.
- `src/lib/server/warehouse/types.ts` — `GameDocument.similar_profiles?`.
- `src/lib/server/warehouse/client.test.ts` — canned `doc` gains `similar_profiles`; parsed through.
- `src/routes/(app)/games/[id]/+page.server.ts` — `toViewModel` builds `g.similarByProfile`; `load` resolves the `?profile=` param; payload gains `profile`.
- `src/routes/(app)/games/[id]/+page.svelte` — segmented control, `$state` active tab, `replaceState` URL sync, disabled tabs, card reads `g.similarByProfile[active]`.
- **Not touched:** `build.ts` / Arrow artifact / `columns.ts` / client catalog / `game-from-catalog.ts` / `serialize.ts` / `similarity.ts` / `/dev/similar` / `games.remote.ts`.

## Steps

### Part A — bgg-data-warehouse — DONE, PR [#109](https://github.com/phenrickson/bgg-data-warehouse/pull/109)

Shipped: `get_game` returns `similar_profiles` (all three lists, `[]` for a profile with
no row); top-level `similar` kept for back-compat; `game_neighbors` re-clustered
`game_id, profile` (with a `DROP TABLE IF EXISTS` — `CREATE OR REPLACE` can't re-cluster
in place) so the all-profiles read is no dearer than the old single-profile one. Compile
check green; 34 reader/router tests pass. Merge auto-deploys the API; **trigger Run
Dataform after merge** so the re-cluster lands. Original Part A detail kept below for
reference.

<details><summary>Part A as planned</summary>

#### bgg-data-warehouse (PR: `feat/similar-doc-all-profiles`)

#### A1. Reader returns all profiles

`src/warehouse/readers/games.py`:

```python
def _similar_all_profiles(game_id: int, client: bigquery.Client) -> dict[str, list[dict[str, Any]]]:
    rows = _rows(
        client,
        f"SELECT profile, similar FROM `{dataset('analytics')}.game_neighbors` "
        "WHERE game_id = @game_id",
        game_id,
    )
    by = {r["profile"]: [dict(s) for s in r["similar"]] for r in rows}
    return {name: by.get(name, []) for name in SIMILAR_PROFILE_NAMES}  # stable key set
```

`get_game`: run it alongside `_profile_row` (already a `ThreadPoolExecutor`); keep the
existing single-profile `similar` block (driven by the `profile` arg) for back-compat;
add `"similar_profiles": _similar_all_profiles(...)` to the returned dict.
`SIMILAR_PROFILE_NAMES` from `includes/similarity_profiles.js`' names, or a local const
mirrored with a comment (the reader can't import JS — check how other readers handle the
profile list; a module const with a "mirror of similarity_profiles.js" note is fine).

**Verify:** `uv run --extra test python -m pytest tests/test_games_reader.py -k profiles`.

#### A2. API + response model

`services/warehouse_api/routers/games.py` `get_game` already returns
`reader.get_game(...)` wholesale, so `similar_profiles` flows through. If a Pydantic
response model is declared, add the field. Keep the `?profile=` → 400-on-unknown path.

**Verify:** the API contract test / `pytest tests/` for the router; manual
`curl`/`httpx` against a local run showing the new key.

#### A3. Cost check

`bq query --dry-run` (or the `_rows` logging) for the new `WHERE game_id =` lookup vs the
old `WHERE profile = AND game_id =`. Expected: same order of magnitude, small table.
Record it in the PR description.

**→ Merge, deploy, confirm live before starting Part B's PR review.** (Part B can be
*written* against the fallback in B4 in parallel.)

</details>

### Part B — bgg-viewer (PR: `feat/similar-profile-switcher`)

#### B1. Profile vocabulary (TDD)

`src/lib/game/similar-profiles.ts` + `.test.ts` first. `SIMILAR_PROFILES`,
`SimilarProfile`, `DEFAULT_SIMILAR_PROFILE`, `isSimilarProfile`, `SIMILAR_PROFILE_LABELS`
(placeholder), and:

```ts
/** raw ?profile= + which profiles have rows for this game → the profile to show. */
export function resolveSimilarProfile(
  raw: string | null,
  available: readonly SimilarProfile[]
): SimilarProfile {
  if (isSimilarProfile(raw) && available.includes(raw)) return raw;
  return DEFAULT_SIMILAR_PROFILE;
}
```

**Verify:** `pnpm test src/lib/game/similar-profiles.test.ts` — unknown → default;
known-but-empty-for-this-game → default; known + available → passthrough.

#### B2. Wire type + client test

`types.ts`: `similar_profiles?: Record<string, SimilarWireRow[]>` on `GameDocument`
(add a `SimilarWireRow` interface — `{ game_id; name; year_published; distance }`).
`client.test.ts`: extend the canned `doc` with a `similar_profiles`, assert `getGame`
returns it. No signature change.

**Verify:** `pnpm test src/lib/server/warehouse`.

#### B3. `toViewModel` → `g.similarByProfile`

In `+page.server.ts`:

```ts
const wire = doc.similar_profiles ?? { [DEFAULT_SIMILAR_PROFILE]: doc.similar as SimilarWireRow[] };
const similarByProfile = Object.fromEntries(
  SIMILAR_PROFILES.map((p) => [p, (wire[p] ?? []).map((s) => ({
    id: s.game_id, name: s.name, year: s.year_published, similarity: 1 - s.distance
  }))])
) as Record<SimilarProfile, SimilarGame[]>;
```

Keep `g.similar` too (= `similarByProfile[DEFAULT_SIMILAR_PROFILE]`) so nothing else that
reads it breaks; the card will switch to `similarByProfile`.

**Verify:** `just check` (payload type changes).

#### B4. `load` resolves the param

```ts
export const load = async ({ params, url }) => {
  // …offline branch: return { …, profile: DEFAULT_SIMILAR_PROFILE }
  const doc = await warehouseClient().getGame(id);
  const game = toViewModel(doc);
  const available = SIMILAR_PROFILES.filter((p) => game.similarByProfile[p].length > 0);
  const profile = resolveSimilarProfile(url.searchParams.get('profile'), available);
  return { game, id, offline: false as const, profile };
};
```

Accessing `url.searchParams` registers the dependency so a `replaceState` that changes it
doesn't re-run `load` (shallow), but a full reload does. Offline returns the default.

**Verify:** `just check`.

#### B5. The segmented control (`+page.svelte`)

- Imports: `SIMILAR_PROFILES`, `SIMILAR_PROFILE_LABELS`, `DEFAULT_SIMILAR_PROFILE` from
  `$lib/game/similar-profiles`; `replaceState` from `$app/navigation`; `page` from `$app/state`.
- `let active = $state(data.profile);` — re-seed on navigation:
  `$effect(() => { active = data.profile; });`
- Above the card's `<p class="sub">`, `{#if !data.offline}`: a `role="group"` row of
  `<button>`s. `aria-pressed={p === active}`. Disabled when
  `g.similarByProfile[p].length === 0` (`disabled` + muted styling).
- `onclick`: `active = p; replaceState(\`?profile=${p}\`, page.state);`
- Card body: `{#each g.similarByProfile[active] as s (s.id)}` — otherwise unchanged
  (thumbnail / initial / name / year / `similarityColor` badge all as-is).
- Empty/offline `{:else}` branches unchanged; a disabled tab means the reader can't get
  the card into a non-default empty state by clicking.
- Styling: `.sub`/card rhythm, CSS-variable tokens, light + dark. Follow
  `frontend-patterns` + `style-rules`. Minimal to start — Phil refines.

**Verify:** `just check`; then B6.

#### B6. Manual (spec Verification), light + dark

Run the spec's list. Key checks: **no network request on toggle** (devtools Network
panel), no scroll jump, reload keeps the profile, back button works, disabled Sicko on a
low-rating game, `?profile=bogus` renders Similar, offline has no switcher, SSR HTML for
`?profile=recommender` already contains that list.

## Risks / unknowns / rollback

- **Deploy skew** (viewer before warehouse): B3's `?? { similar: doc.similar }` fallback
  keeps the page working with only the "Similar" tab live. Still, deploy warehouse first.
- **Document size / query cost:** measured in A3. Expected trivial; revisit if a list is
  ever ≫ 10 rows.
- **`replaceState` + SvelteKit:** confirm `replaceState('?profile=…', page.state)` from
  `$app/navigation` updates the URL without re-running `load` (it's the shallow-routing
  API; `games/+page.svelte` already uses raw `history.replaceState`, `discover` uses
  `replaceState` from `$app/navigation` — follow discover's usage).
- **Rollback:** viewer feature is inert without a `?profile=` param and degrades to
  today's card; revert the branch, nothing else to undo. Warehouse change is additive
  (`similar_profiles` alongside `similar`) — revert leaves the old contract intact.

## Out of scope

Geek-rating badge on rows; new/retuned profiles; live tunable knobs on the real page;
localStorage last-used profile; removing `?profile=` from `GET /games/{id}`.

## Open questions

None. `similar_profiles` shape is settled in #109: `{ similar: rows[], recommender:
rows[], sicko: rows[] }`, every key present, `[]` when empty. B3 reads
`doc.similar_profiles[name]`.

## Status

- Part A: PR [#109](https://github.com/phenrickson/bgg-data-warehouse/pull/109) open,
  compile check green — **awaiting Phil's review + merge** (then trigger Run Dataform).
- Part B: not started; local branch `feat/similar-profile-switcher` holds the spec + plan.
