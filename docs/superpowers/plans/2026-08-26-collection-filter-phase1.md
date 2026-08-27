# Collection Filter (Phase 1, Admin-Only) — Implementation Plan

**Date:** 2026-08-26
**Spec:** [2026-08-26-collection-filter-design.md](../specs/2026-08-26-collection-filter-design.md)
**Branches:** `feat/user-collections-model` (bgg-data-warehouse), `feat/admin-collection-filter` (bgg-viewer)

## Goal & success criteria

Admin (Phil) can pick a BGG username that already has rows in bgg-predictive-models'
collection data and filter the bgg-viewer catalog down to just that collection's games. Done
when: the picker is visible only to Phil, filtering works entirely client-side against the
existing catalog artifact with **no** change to the Arrow schema, cache, or ETag machinery, and
both repos' verify commands pass.

## Data flow decision

Ship a bare list of owned `game_id`s to the client (small JSON — a personal collection is a few
hundred to low thousands of rows) rather than baking the collection join into the per-session
Arrow catalog artifact.

- The catalog artifact is one shared blob cached across every user, keyed by a content-hash ETag
  (`src/lib/server/catalog/cache.ts`). Making it vary per admin-selected username would break
  that invariant for a feature only one person uses.
- There's already a precedent for exactly this shape: thumbnails load as a **second small
  table** — `CREATE TABLE thumbnails (game_id INTEGER, thumbnail VARCHAR)`
  (`src/lib/catalog/catalog.svelte.ts:77`) — joined by `game_id` alongside the catalog, entirely
  outside `Scope`/`toWhere`. The collection filter follows the same pattern: 
  `CREATE TABLE owned_collection (game_id INTEGER)`, populated only when admin picks a username,
  consulted via `INNER JOIN owned_collection USING (game_id)` when active.
- This keeps `scope.ts`'s `Scope` / `toWhere` / URL round-trip (`scopeToParams`/`scopeFromParams`)
  completely untouched — the collection filter is orthogonal client state, not a new `Scope` field.

## Why two repos

bgg-viewer's BigQuery service account cannot read bgg-predictive-models' `collections` dataset
today (confirmed — no grant exists in `terraform/iam.tf`). Rather than open new cross-project IAM
for an unvalidated admin-only feature, expose the table through a Dataform model in
bgg-data-warehouse — the same pattern `definitions/user_collection_predictions.sqlx` already uses
to read that project's `raw.collection_models_registry` / `raw.collection_predictions_landing`.
bgg-viewer then reads it exactly like it already reads `analytics.games_features` or
`predictions.bgg_predictions` — no new client, no new credentials, no new grant.

## Affected files

**bgg-data-warehouse:**
- `definitions/sources.js` — add `declare({ database: "bgg-predictive-models", schema: "collections", name: "user_collections" })` (the *source* dataset, in bgg-predictive-models).
- `definitions/user_collections.sqlx` — **new**. `config { schema: "collections" }` — lands as **`bgg-data-warehouse.collections.user_collections`**, a new schema (see spec: a dedicated home for raw, per-account, externally-sourced data that's neither an ML artifact (`predictions`) nor a warehouse-derived product (`analytics`)). A view selecting `username, game_id, owned, want, user_rating, updated_at` from the declared source, `WHERE removed_at IS NULL`. (`updated_at` is included from the start so the UI can show "last synced" — cheap now, awkward to retrofit once the API/UI shape has shipped without it.)

**bgg-viewer:**
- `src/lib/server/auth/admin.ts` — **new**. `ADMIN_EMAIL` constant + `isAdmin(user: SessionUser | null): boolean`. Single source of truth so the security check (API route) and the UI-visibility check don't duplicate the literal.
- `src/lib/server/collections/read.ts` — **new**. `fetchOwnedCollection(username, client?)` querying `collections.user_collections`, DI-testable like the existing catalog/warehouse readers. Returns `{ game_ids: number[], updated_at: string | null }`.
- `src/routes/api/collection/+server.ts` — **new**. `GET ?username=` — 401 if no session, 403 if `!isAdmin(locals.user)`, else the reader's result as JSON.
- `src/lib/catalog/collectionData.svelte.ts` — **new**. Deliberately named/shaped a level more general than "ownership filter": `$state` holding the selected username + fetched tables; `applyCollectionTable(conn, name, rows)` creates/repopulates a named table in DuckDB (`owned_collection` today); `clearCollectionTable(conn, name)` drops it. Kept general because a future `collection_predictions` table (once collection-predictions integration happens, per the spec's forward-looking note) is the same shape — fetch a small per-username table, register it, join by `game_id` — and should extend this module rather than require a rewrite.
- `src/lib/catalog/catalog.svelte.ts` — wherever the query is composed, conditionally add `INNER JOIN owned_collection USING (game_id)` when a filter is active (mirrors the existing `thumbnails` join).
- `src/lib/catalog/AdminCollectionPicker.svelte` — **new**. Username input + Apply/Clear, rendered only when `isAdmin` is true; shows the `updated_at` hint once a collection is applied.
- Wherever `isAdmin` needs to reach the UI (likely the relevant `+layout.server.ts` under `(app)`) — pass it through `PageData`/`LayoutData` rather than re-deriving it client-side.

## Steps

### Part A — bgg-data-warehouse

1. **Source + model.** Add the `sources.js` declaration and `user_collections.sqlx` view.
   **Verify:** Dataform compile + a `CREATE VIEW`/dry-run per this repo's Dataform-validation
   convention (a bare `SELECT` dry-run misses `ref()`/duplicate-field errors).
2. **PR + merge.** Push `feat/user-collections-model`, open PR to `main`. **Phil merges.**
   **Verify after merge:** `bq query` sanity check — `SELECT * FROM bgg-data-warehouse.collections.user_collections WHERE username = '<phil's bgg username>' LIMIT 5` returns real rows.

### Part B — bgg-viewer (needs Part A merged first)

3. **Admin check.** `src/lib/server/auth/admin.ts`.
   **Verify:** trivial unit test — matches the configured email, rejects everything else including `null`.
4. **Reader.** `fetchOwnedCollection()`.
   **Verify:** unit test with an injected fake BigQuery client, asserting the query filters
   `removed_at IS NULL` and shapes the result as `{ game_ids, updated_at }`.
5. **Route.** `GET /api/collection?username=`.
   **Verify:** test the 401/403/200 paths; manual `curl` locally with `DEV_AUTH_EMAIL` set to the
   admin address vs. any other address.
6. **Client-side filter state + DuckDB join.** `collectionData.svelte.ts`, the `owned_collection`
   table, conditional join in the catalog query.
   **Verify:** `just check`; a Vitest unit test on the SQL-building piece if practical (mirrors
   `scope.test.ts`'s style for pure predicate logic); manual `just dev` check — apply a known
   username, confirm the catalog count drops to that collection's size, clear it, confirm the
   full working set returns.
7. **UI control.** `AdminCollectionPicker.svelte`, gated by `isAdmin`, wired to steps 5–6, showing
   the `updated_at` hint.
   **Verify:** `just dev` in both light and dark — control invisible when not logged in as admin,
   visible and functional when `DEV_AUTH_EMAIL` is the admin address.
8. **Full check + PR.** `just check` (svelte-check + lint + types) and `just test`, push
   `feat/admin-collection-filter`, open PR to `main`. **Phil merges.**

## Risks / unknowns / rollback

- **Stale collections are silent by design in Phase 1** — there is no fetch-on-demand here, only
  a read of whatever's already in `user_collections`. The `updated_at` surfaced in the UI is the
  mitigation: it tells admin how stale the view is rather than hiding it.
- **Rollback**: every new file on both sides is additive; reverting either PR removes the feature
  cleanly. No change to the shared Arrow artifact, `columns.ts`, or cache/ETag behavior — this is
  the one-way-door check from the spec, and there isn't one here.
- **Sequencing**: Part B's reader/route/UI can be coded before Part A merges (all
  injectable/mockable in tests), but `just dev` won't show real data until the Dataform view exists.

## Out of scope

Per the spec: Phase 2 (self-serve `bgg_username` + on-demand sync), any `is_admin` column on the
shared `core.users` table, a side-by-side diff view, verifying BGG-username ownership, and any
real-time/background re-sync of a collection.
