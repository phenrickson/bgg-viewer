# Recommend: shelf answers ranked in the browser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Recommend's *my shelf* and *games I don't own* work in production, instantly after one load, by shipping every game's embedding to the browser and ranking there, then remove the per-user prototype artifact.

**Architecture:** A new `vectors` Arrow artifact (one row per working-set game: id, 64-d float32 embedding, the ranking columns, and the `similarity_profiles` rows in its metadata) is built by the existing daily `viewer-artifacts` workflow and served through the same GCS pointer route as `coordinates`. The page loads it in the background when Recommend opens (after the catalog, only with a collection) and ranks with a pure TypeScript port of `game_neighbors` (*games I don't own*) and three shelf styles (*my shelf*). The owned ids come from the existing `/api/collection`; an admin's unseen username is synced through a new admin-only endpoint and polled.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, `apache-arrow`, `@google-cloud/bigquery`, Vitest, GitHub Actions (`viewer-artifacts.yml`).

**Spec:** `docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md` (read it with this plan).

**Delivery:** All work on `feat/recommend-tool` (already pushed, no PR yet). Commit and push after each task (`gh pr view --json state,mergedAt` before every push once the PR exists). The last task opens one PR to `main`; Phil merges. Never `gh pr merge`. Builds and deploys only through GitHub Actions — never `gcloud` or a non-`--dry-run` publish locally.

## Global Constraints

- Branch `feat/recommend-tool`; one PR to `main`; Phil merges.
- Conventional commits, scoped: `type(scope): …` (scopes in use: `recommend`, `ui`, `catalog`, `ci`).
- Artifact rows: the catalog's working set, `WORKING_SET_WHERE` from `src/lib/server/catalog/columns.ts` (rated ≥30, or published this year or later). Not a copy of it.
- Embedding: `analytics.game_similarity_search.embedding`, 64 dims, **float32** (int8 failed fidelity: 4/15 lists).
- Ranking columns (`complexity`, `users_rated`, `geek_rating`) from `game_similarity_search`, not the catalog's features.
- `geek_pct` = `PERCENT_RANK() OVER (ORDER BY geek_rating)` over every `game_similarity_search` row with `geek_rating > 0`, else 0.
- Keep every `embedding_version` in the artifact (10 games are still v5); metadata records the latest version and model.
- Profiles ship in the artifact's schema metadata (key `similarity_profiles`, JSON of `analytics.similarity_profiles` rows). No profile constants copied into TypeScript.
- GCS pointer `vectors-current.json`, object prefix `vectors`; escape hatch env `VECTORS_SOURCE=bigquery`.
- Load: only on `/recommend`, after `catalog.status === 'ready'`, and only when the collection being viewed has owned ids.
- Owned set = the collection's owned ids that are in the artifact. Games outside it are left out everywhere on the page.
- Shelf styles, top 10, product-line cap 1, no floors, no band: Most Similar = plain similarity; Recommended = `0.6·sim + 0.4·shelf_pct`; Dark Horses = owned games with `shelf_pct < 0.5`, by plain similarity. `shelf_pct` = percent rank of `geek_pct` within the owned set.
- Admin sync poll: every **5 s**, give up after **3 min**.
- Copy is Phil's: every new user-facing string is marked `PLACEHOLDER(Phil)` once in source and is not a blocker.

## Review Focus

1. **A seed with no vector** (a hand-edited `?id=`, or a catalog game the artifact lacks) → the shelf pools show the empty state; nothing throws. Test in Task 4.
2. **A shelf with one game in the artifact** → `shelf_pct` has no `n − 1` to divide by; it must be 0, never `NaN`. Test in Task 5.
3. **An owned seed in *games I don't own*** → the seed and owned games are removed *before* the product-line cap and `top_k`, so lists still fill to 10. Test in Task 4.
4. **Admin switches username while a load is in flight** → the older load's owned ids never land under the newer username. Checked by hand in Task 8, step "race".
5. **The vectors fetch fails** (GCS and the BigQuery fallback both) → shelf pools show an error line; *anywhere* keeps working. Checked by hand in Task 8.

---

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/server/vectors/columns.ts` | create | The BigQuery SELECT for the artifact |
| `src/lib/server/vectors/serialize.ts` | create | Rows → Arrow IPC with metadata |
| `src/lib/server/vectors/build.ts`, `cache.ts`, `gcs.ts` | create | Same roles as `src/lib/server/coordinates/*` |
| `src/routes/api/vectors/+server.ts` | create | Signed URL, or bytes as fallback (copy of `/api/coordinates`) |
| `scripts/build-vectors-artifact.ts` | create | CI build + `publishArtifact` |
| `.github/workflows/viewer-artifacts.yml` | modify | One more step after coordinates |
| `src/lib/recommend/vectors.ts` | create | Client: parse + memoised fetch → `VectorSet` |
| `src/lib/recommend/rank.ts` | create | Pure ranking: `rankCatalog`, `rankShelf` |
| `scripts/check-vectors-fidelity.ts` | create | One-off check: `rankCatalog` vs `game_neighbors` |
| `src/lib/server/auth/collection-access.ts` | create | `canReadCollection(user, username)` |
| `src/routes/api/collection/sync/+server.ts` | create | Admin-only sync trigger |
| `src/lib/recommend/sources.ts` | modify | Lists become styles-only; routing helpers removed |
| `src/routes/(app)/recommend/+page.svelte` | modify | Collection, vectors and answer wiring |
| `src/lib/server/collection-neighbors/`, `scripts/build-collection-neighbors.ts`, `src/routes/api/collection-neighbors/` | delete | The per-user prototype |
| `src/routes/api/similar/+server.ts`, `src/lib/server/warehouse/client.ts` | modify | Drop the pooled branches and `getSimilarPooled` |

---

### Task 1: The vectors query and serializer

**Files:**
- Create: `src/lib/server/vectors/columns.ts`, `src/lib/server/vectors/serialize.ts`
- Test: `src/lib/server/vectors/columns.test.ts`, `src/lib/server/vectors/serialize.test.ts`

**Interfaces:**
- Produces: `vectorsQuerySql(tables: { features: string; gss: string; lines: string; profiles: string }): string` (selects `game_id, embedding, complexity, users_rated, geek_pct, line, embedding_version, embedding_model`); `profilesQuerySql(profilesTable: string): string`.
- Produces: `type VectorRow = { game_id: unknown; embedding: number[]; complexity: number | null; users_rated: unknown; geek_pct: number | null; line: unknown; embedding_version: unknown; embedding_model: string }`; `type ProfileRow` = the `analytics.similarity_profiles` columns (`name, weight, complexity_band, max_per_family, min_similarity, min_rating_pct, max_rating_pct, min_users_rated, source_min_users_rated, top_k, dims, distance`); `rowsToArrowIPC(rows: VectorRow[], profiles: ProfileRow[]): Uint8Array`; metadata keys `META_VERSION = 'embedding_version'`, `META_MODEL = 'embedding_model'`, `META_PROFILES = 'similarity_profiles'`, `META_DIMS = 'dims'`.

- [ ] **Step 1: Write the failing tests**

`columns.test.ts`:
- `it('filters to the catalog working set')`: the SQL contains `WORKING_SET_WHERE` (imported, not a literal).
- `it('ranks geek rating over the whole table, not the working set')`: the SQL contains `PERCENT_RANK() OVER (ORDER BY geek_rating)` inside a CTE whose `WHERE` is `geek_rating > 0` and which reads the `gss` table without the working-set filter.
- `it('takes the ranking columns from game_similarity_search')`: `complexity` and `users_rated` are selected from the `gss` alias, not the features alias.

`serialize.test.ts` (two rows, `embedding` of length 64, one at v6 and one at v5, two profile rows):
- `it('writes a 64-wide float32 embedding per game')`: `tableFromIPC(out).getChild('embedding').type` is `FixedSizeList<Float32>` with `listSize === 64`; `numRows === 2`.
- `it('keeps every embedding version and records the latest')`: does not throw for mixed versions; `metadata.get('embedding_version') === '6'`.
- `it('ships the profiles as JSON metadata')`: `JSON.parse(metadata.get('similarity_profiles'))` deep-equals the input profile rows; `metadata.get('dims') === '64'`.
- `it('stores a missing product line as null and geek_pct as 0 when missing')`.
- `it('refuses an embedding that is not 64 wide')`: a 63-long embedding throws.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm exec vitest run src/lib/server/vectors`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both modules**

`columns.ts`: `FROM features f JOIN gss g USING (game_id) LEFT JOIN pct USING (game_id) LEFT JOIN lines USING (game_id) WHERE ${WORKING_SET_WHERE} ORDER BY game_id`, with `pct` as in Global Constraints and `lines` = `SELECT game_id, ANY_VALUE(product_line_id) AS line FROM lines GROUP BY game_id`. `COALESCE(pct.geek_pct, 0)`. Model the file's header comment on `src/lib/server/coordinates/columns.ts`.

`serialize.ts`: columns `game_id` Int32, `embedding` FixedSizeList<Float32, 64>, `complexity` Float32, `users_rated` Int32, `geek_pct` Float32, `line` Int32 (nullable); metadata as listed. Unlike coordinates, mixed versions are allowed (log nothing here; the build script logs).

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm exec vitest run src/lib/server/vectors`
Expected: PASS.

- [ ] **Step 5: Commit and push**

`feat(recommend): the vectors artifact's query and Arrow serializer`

---

### Task 2: Build, serve and publish the vectors artifact

**Files:**
- Create: `src/lib/server/vectors/build.ts`, `cache.ts`, `gcs.ts`, `src/routes/api/vectors/+server.ts`, `scripts/build-vectors-artifact.ts`
- Modify: `.github/workflows/viewer-artifacts.yml` (a step after "Build and upload coordinates")

**Interfaces:**
- Consumes: Task 1's `vectorsQuerySql`, `profilesQuerySql`, `rowsToArrowIPC`.
- Produces: `GET /api/vectors` → JSON `{ url, hash, builtAt }` (signed GCS) or gzip Arrow bytes; `buildVectorsArtifact(): Promise<Uint8Array>`.

- [ ] **Step 1: Write `build.ts`, `cache.ts`, `gcs.ts` and the route** as copies of the coordinates modules with: tables `${PROJECT}.analytics.games_features`, `${PROJECT}.analytics.game_similarity_search`, `${PROJECT}.analytics.game_product_line`, `${PROJECT}.analytics.similarity_profiles`; cache path `.cache/vectors.arrow.gz`; TTL 24 h; pointer `vectors-current.json`, label `vectors`; env `VECTORS_SOURCE`. `buildVectorsArtifact` throws on zero rows and on zero profiles.

- [ ] **Step 2: Write `scripts/build-vectors-artifact.ts`** as a copy of `scripts/build-coordinates-artifact.ts`: run both queries, log row count and how many rows are below the latest `embedding_version`, then `publishArtifact({ prefix: 'vectors', pointerName: 'vectors-current.json', … })`.

- [ ] **Step 3: Dry-run the script locally**

Run: `pnpm dlx tsx@4 scripts/build-vectors-artifact.ts --dry-run`
Expected: ~32k rows, "N rows below v6" with N around 10, a raw size near 8.8 MB, and no upload.

- [ ] **Step 4: Add the workflow step** "Build and upload vectors", same shape as the coordinates step, after it.

- [ ] **Step 5: Check the route through the BigQuery fallback**

With `VECTORS_SOURCE=bigquery` set in `.env`, run `just dev` and `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" -b <session cookie> localhost:5173/api/vectors`.
Expected: `200` and a gzipped size near 7.9 MB. Remove the env line afterwards. (Phil runs the dev server; ask him to, don't start one.)

- [ ] **Step 6: Type-check, commit and push**

Run: `pnpm check` → 0 errors.
`feat(recommend): build, serve and publish the vectors artifact`

---

### Task 3: Client reader

**Files:**
- Create: `src/lib/recommend/vectors.ts`
- Test: `src/lib/recommend/vectors.test.ts`

**Interfaces:**
- Consumes: the artifact from Task 1/2.
- Produces:
  ```ts
  export interface Profile { name: string; weight: number; complexity_band: number | null; max_per_family: number | null; min_similarity: number; min_rating_pct: number; max_rating_pct: number; min_users_rated: number; source_min_users_rated: number; top_k: number }
  export interface VectorSet { ids: Int32Array; vec: Float32Array /* n×64, L2-normalised */; complexity: Float32Array; usersRated: Int32Array; geekPct: Float32Array; line: Int32Array /* -1 = none */; index: Map<number, number>; profiles: Profile[]; version: number; model: string }
  export const DIMS = 64;
  export function parseVectors(buf: Uint8Array): VectorSet;
  export function fetchVectors(): Promise<VectorSet>; // memoised; reset on failure
  export function _resetVectors(): void;
  ```

- [ ] **Step 1: Write the failing tests** (build the fixture with Task 1's `rowsToArrowIPC`):
- `it('normalises every vector to unit length')`: each 64-slice of `vec` has norm 1 ± 1e-6.
- `it('indexes games by id')`: `index.get(id)` returns the row.
- `it('reads a missing product line as -1')`.
- `it('carries the shipped profiles')`: `profiles.map(p => p.name)` equals the fixture's.

- [ ] **Step 2: Run to fail** — `pnpm exec vitest run src/lib/recommend/vectors.test.ts` → FAIL.

- [ ] **Step 3: Implement** with plain `apache-arrow` (no DuckDB), following `src/lib/map/coordinates.ts`; `fetchVectors` uses `fetchArtifactBytes('/api/vectors')`.

- [ ] **Step 4: Run to pass**, then commit and push: `feat(recommend): client reader for the vectors artifact`

---

### Task 4: `rankCatalog` — *games I don't own*

**Files:**
- Create: `src/lib/recommend/rank.ts`
- Test: `src/lib/recommend/rank.test.ts`

**Interfaces:**
- Consumes: `VectorSet`, `Profile` (Task 3); `Hit` from `sources.ts`.
- Consumes: `Lists`'s current `{ kind: 'styles'; similar; recommender; sicko }` variant from `sources.ts` (Task 7 drops the `kind` field and the `shelf` variant, here and in `sources.ts`, in one go).
- Produces: `rankCatalog(v: VectorSet, seedId: number, exclude: ReadonlySet<number>): Lists` (the styles variant), one list per `Profile.name`.

The rules are `partCSql` in `src/lib/server/collection-neighbors/columns.ts` (deleted in Task 9; read it first): seed must have `users_rated >= source_min_users_rated`; candidates exclude the seed and `exclude`, need `users_rated >= min_users_rated`, `|cx − seed cx| <= complexity_band` when the band is set, `sim >= min_similarity`, `geek_pct >= min_rating_pct` unless it is 0, `geek_pct < max_rating_pct` unless it is 1; score `weight·sim + (1−weight)·geek_pct`; sort by score; product-line cap keeps a lined game only while its line's count `<= max_per_family` (null = no cap, **0 drops every lined game**); stop at `top_k`. `sim` is the dot product of unit vectors.

- [ ] **Step 1: Write the failing tests** on a hand-built `VectorSet` (6–10 games, 2-d vectors padded to 64 are fine):
- `it('ranks by weight·sim + (1−weight)·geek_pct')`.
- `it('applies the candidate floor, complexity band and similarity floor')`.
- `it('treats min_rating_pct 0 and max_rating_pct 1 as off')`, and `it('keeps only games below max_rating_pct')`.
- `it('caps games per product line, and max_per_family 0 drops lined games')`.
- `it('returns nothing for a seed under source_min_users_rated')`.
- `it('returns empty lists for a seed with no vector')` *(Review Focus 1)*.
- `it('removes excluded games before the cap and top_k, so lists still fill')` *(Review Focus 3)*: with `top_k = 3`, excluding 2 of the top 3 still returns 3.

- [ ] **Step 2: Run to fail** — `pnpm exec vitest run src/lib/recommend/rank.test.ts` → FAIL.

- [ ] **Step 3: Implement `rankCatalog`.** One pass over the candidates per profile; the spike's `rank()` (in the spec's measurements) is the reference shape.

- [ ] **Step 4: Run to pass**, commit and push: `feat(recommend): rank games I don't own in the browser`

---

### Task 5: `rankShelf` — *my shelf*

**Files:**
- Modify: `src/lib/recommend/rank.ts`, `src/lib/recommend/rank.test.ts`

**Interfaces:**
- Produces: `rankShelf(v: VectorSet, seedId: number, owned: ReadonlySet<number>): Lists`; `export const SHELF_STYLES` (the one constant holding the shelf rules from Global Constraints).

- [ ] **Step 1: Write the failing tests:**
- `it('ranks only owned games, never the seed')`.
- `it('Most Similar is plain similarity, one per product line, top 10')`.
- `it('Recommended blends 0.6·sim + 0.4·shelf_pct')` with a fixture where the blend reorders two games.
- `it('Dark Horses keeps only the lower half of the shelf by rating')` (`shelf_pct < 0.5`).
- `it('computes shelf_pct within the shelf, 0 for a one-game shelf')` *(Review Focus 2)*: no `NaN` anywhere in the output.

- [ ] **Step 2: Run to fail**, **Step 3: implement**, **Step 4: run to pass.**

- [ ] **Step 5: Commit and push:** `feat(recommend): three styles on my shelf`

---

### Task 6: Fidelity check against `game_neighbors`

**Files:**
- Create: `scripts/check-vectors-fidelity.ts`

**Interfaces:**
- Consumes: `buildVectorsArtifact` (Task 2), `parseVectors` (Task 3), `rankCatalog` (Task 4).

- [ ] **Step 1: Write the script.** Build the artifact in memory, parse it, and for the seeds `266192, 224517, 432, 13, 230802` (Wingspan, Brass: Birmingham, Take 5, Catan, Azul) compare `rankCatalog(v, seed, new Set())` per profile with `analytics.game_neighbors` (`profile, game_id, similar[].game_id`). Print one line per seed × profile and a final `N/15 identical`. Exit non-zero below 15.

- [ ] **Step 2: Run it**

Run: `pnpm dlx tsx@4 scripts/check-vectors-fidelity.ts`
Expected: `15/15 identical`. If not, fix `rankCatalog` (Task 4) before going on; record the output for the PR.

- [ ] **Step 3: Commit and push:** `test(recommend): fidelity check for browser ranking`

---

### Task 7: Collection access, admin sync, and styles-only lists

**Files:**
- Create: `src/lib/server/auth/collection-access.ts`, `src/lib/server/auth/collection-access.test.ts`, `src/routes/api/collection/sync/+server.ts`
- Modify: `src/routes/api/collection/+server.ts`, `src/lib/recommend/sources.ts`, `src/lib/recommend/sources.test.ts`, `src/lib/recommend/rank.ts`, `src/routes/(app)/recommend/+page.svelte` (only the `kind` references, so it still type-checks; Task 8 rewires it)

**Interfaces:**
- Produces: `canReadCollection(user: SessionUser | null | undefined, username: string): boolean` (own linked `bgg_username`, or admin).
- Produces: `POST /api/collection/sync?username=` → 401 signed out, 403 not admin, 400 no username, else `{ synced: boolean }` from `triggerSync(username, { force: true })`.
- Produces in `sources.ts`: `Lists = { similar: Hit[]; recommender: Hit[]; sicko: Hit[] }` (no `kind`; `rank.ts` updated to match); `withoutIds(lists, drop)`, `surpriseFrom`, `drawFrom`, `SECTION_MAX` kept. Removed: `sourceFor`, `Source`, `POOLS`' routing use, `MIN_AFTER_OWNED`, `tooThin`, `sectionsFor`, the `shelf` list kind.

- [ ] **Step 1: Write the failing tests** — `collection-access.test.ts`: own username true; another username false; admin any username true; signed out false; an unlinked user false. Update `sources.test.ts` for the styles-only `Lists` and delete the tests of removed functions.

- [ ] **Step 2: Run to fail**, **Step 3: implement**; `/api/collection` uses `canReadCollection`.

- [ ] **Step 4: Run to pass** — `pnpm exec vitest run src/lib/server/auth src/lib/recommend` → PASS.

- [ ] **Step 5: Commit and push:** `feat(recommend): one collection access rule; admin sync endpoint`

---

### Task 8: Rewire the page

**Files:**
- Modify: `src/routes/(app)/recommend/+page.svelte`

**Interfaces:**
- Consumes: `fetchVectors` (Task 3), `rankCatalog`, `rankShelf` (Tasks 4–5), `Lists` (Task 7), `/api/collection`, `POST /api/collection/sync`.

State the page keeps (replacing `art`, `nearMiss`, `loadArrowTable('collection_neighbors', …)`): `ownedIds: number[]` from `/api/collection`; `vectors: VectorSet | null`; `vectorsState: 'idle' | 'loading' | 'ready' | 'error'`; `owned = vectors ? ids in vectors.index : empty`; `hasShelf = ownedIds.length > 0`.

- [ ] **Step 1: Collection load.** `loadCollection(u)` fetches `/api/collection?username=`, carries a token like the answer effect, and on any start clears `ownedIds`, `owned` and the shelf row so nothing of the previous user survives (spec §6.2, §6.3).

- [ ] **Step 2: Admin sync.** When an admin's view-as username returns no owned ids, `POST /api/collection/sync`, show `PLACEHOLDER(Phil): fetching {username}'s collection from BGG…`, re-ask `/api/collection` every 5000 ms, stop after 180000 ms with `PLACEHOLDER(Phil): couldn't get {username}'s collection — try again later.` A newer username cancels the poll.

- [ ] **Step 3: Vectors in the background.** An effect: when `catalog.status === 'ready'` and `ownedIds.length > 0` and `vectorsState === 'idle'`, call `fetchVectors()`; failure sets `vectorsState = 'error'`.

- [ ] **Step 4: The answer by pool.** `all` → `/api/similar?pool=all` as now, depending on the seed only (spec §6.6). `unowned` → `rankCatalog(vectors, seed, owned)`. `shelf` → `rankShelf(vectors, seed, owned)`. Shelf pools while `vectorsState === 'loading'` stay pending; on `'error'` show `PLACEHOLDER(Phil): couldn't load your shelf.` The tabs and sheet now show in every pool (the `shown.kind === 'shelf'` branches go). `listsFor` keeps marking which `seed|pool` the lists answer.

- [ ] **Step 5: Shelf row** queries only `owned` (games in the artifact).

- [ ] **Step 6: Check by hand on Phil's dev server** (ask him to run `just dev`; don't start one):
  - *my shelf* and *games I don't own* answer for a game you own and one you don't, with three tabs each.
  - **race** *(Review Focus 4)*: as admin, enter username A and immediately B; the shelf and badges are B's.
  - **fetch failure** *(Review Focus 5)*: block `/api/vectors` in devtools; shelf pools show the error line, *anywhere* still answers.
  - Time the first flip and a shelf click in Chrome devtools, unthrottled and with "Fast 4G" + 4× CPU slowdown; note the numbers for the PR.

- [ ] **Step 7: Type-check, commit and push** — `pnpm check` → 0 errors. `feat(recommend): shelf pools rank in the browser`

---

### Task 9: Remove the prototype paths

**Files:**
- Delete: `src/lib/server/collection-neighbors/` (cache, columns, serialize), `scripts/build-collection-neighbors.ts`, `src/routes/api/collection-neighbors/+server.ts`
- Modify: `src/routes/api/similar/+server.ts` (only `pool=all`; any other pool → 400), `src/lib/server/warehouse/client.ts` and `client.test.ts` (remove `getSimilarPooled`, `SimilarPool` and their test)

- [ ] **Step 1: Delete and trim.** `grep -rn "collection-neighbors\|collection_neighbors\|getSimilarPooled\|SimilarPool" src scripts` → no matches.

- [ ] **Step 2: Full check** — `pnpm check` → 0 errors; `pnpm test` → all pass.

- [ ] **Step 3: Commit and push:** `refactor(recommend): drop the per-user prototype artifact and pooled calls`

---

### Task 10: Docs, verification and the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md` (status → built; §7 brought up to date with the page as it is: tabs onto a sheet, fixed "Games like X" heading, "Selected game" label, no trail, tile click opens the why, the why's layout and links)
- Modify: `docs/superpowers/specs/2026-09-25-recommend-ui-and-why-design.md` (a line at the top pointing to the 11-09 spec for §2 and §6)

- [ ] **Step 1: Update both specs.**

- [ ] **Step 2: Final verification** — `pnpm check` (0 errors), `pnpm test` (all pass), `pnpm build` (succeeds).

- [ ] **Step 3: Open the PR** to `main` from `feat/recommend-tool`, title `feat(recommend): Recommend tool with shelf answers ranked in the browser`. Body: what ships, the fidelity output (Task 6), the timings (Task 8), that the vectors artifact first lands on the next `viewer-artifacts` run (until then `/api/vectors` builds from BigQuery), and the open copy item: the Tools-menu `PLACEHOLDER(Phil): one-line description` must be filled before merge. Hand it to Phil; don't merge.
