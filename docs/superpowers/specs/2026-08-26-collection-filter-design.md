# BGG Viewer — Collection Filter — Design

**Date:** 2026-08-26
**Status:** Proposed

> Copy note: all user-facing strings implied below are **placeholder** — Phil writes the final copy.

## Goal

Let a logged-in bgg-viewer user filter or annotate the catalog against a BGG collection.
Two phases:

- **Phase 1 (admin only):** filter the catalog by a collection that's already been loaded into
  BigQuery, using the existing collection pipeline's data as-is. No new fetching, no account changes.
- **Phase 2 (self-serve):** a user links their BGG username at registration, which triggers a
  non-blocking sync, after which a one-click "My collection" toggle is available; admin's
  arbitrary-username lookup becomes the same underlying mechanism with a wider scope.

Success: Phase 1 proves the catalog+collection join is useful UI before any new
infrastructure is built; Phase 2 answers the actual ask — a regular user filtering to *their*
collection.

## Background — what already exists

- **bgg-predictive-models** owns the collection pipeline: `BGGCollectionLoader` /
  `CollectionStorage` (`src/collection/`) hit BGG's collection XML endpoint, parse it, and
  upsert into `collections.user_collections` — a table in the **`bgg-predictive-models`**
  GCP project, keyed by `(username, game_id)`, already multi-user (registry table
  `collection_models_registry` + a daily GH Actions loop already exist for *rescoring* known
  users). Fetching is already parameterized by username via the CLI
  (`uv run python -m src.collection.cli run --username <x>`); it already handles BGG's
  202/429 polling. Pulling a **new** username on demand is currently a manual CLI run, not an API.
- **bgg-data-warehouse** already cross-project-reads bgg-predictive-models: the existing
  `definitions/user_collection_predictions.sqlx` Dataform model does exactly this, and the
  Dataform service agent already holds project-level `bigquery.dataViewer` on
  `bgg-predictive-models` (`terraform/iam.tf`). Exposing another table from that project
  through Dataform costs **no new IAM**.
- **bgg-viewer**'s BigQuery client (`src/lib/server/catalog/build.ts` etc.) only ever queries
  its own project, `bgg-data-warehouse`, as service account
  `bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`. That SA has **no grant** on
  `bgg-predictive-models` today — reading `user_collections` directly from the viewer would
  require a brand new cross-project IAM grant.
- bgg-viewer already requires login app-wide (`core.users`, a table shared with dash-viewer;
  session via signed cookie, `locals.user` on every request). The catalog itself is a single
  Arrow IPC artifact built server-side and queried client-side in DuckDB-WASM — there's no
  per-request server-side filtering today.
- No `is_admin`/role field exists on `core.users`. No per-user profile fields (like a BGG
  username) exist anywhere yet.

## Decision: expose the collection via a Dataform model, not new cross-project IAM

Add a Dataform model in bgg-data-warehouse — `definitions/user_collections.sqlx`, landing as
**`collections.user_collections`** (a new schema) — selecting from bgg-predictive-models's
`collections.user_collections`. bgg-viewer then reads it the same way it reads every other
warehouse table it already touches. This avoids opening a new cross-project grant for a feature
that's still unvalidated (Phase 1) and keeps the read path consistent with how the viewer
already gets predictions data.

**Schema placement: a new `collections` schema, not `predictions` or `analytics`.** Everything
currently in `predictions` is an ML-pipeline artifact — `bgg_game_embeddings`/
`bgg_game_coordinates` aren't predictions in any literal sense, but they're outputs of a trained
model, same as `bgg_complexity_predictions` and `user_collection_predictions` (itself built from
`collection_models_registry` + `collection_predictions_landing`, both model-registry/scored-output
tables). `collections.user_collections` is not that: it's a plain BGG API fetch with no modeling
involved anywhere. It's related to `user_collection_predictions` only by topic (both concern a
user's collection), not by lineage or kind — one is raw membership, the other is a model's
scored output over it, and they don't even reference each other in Dataform.

`analytics` doesn't fit either — that schema is for things *derived* from already-landed data
inside the warehouse (e.g. `game_similarity_search` joins `bgg_game_embeddings` +
`games_features`), and `user_collections` is a direct landing, not a derived product.

A dedicated `collections` schema is the honest category: raw, per-account, externally-sourced
data that isn't a model artifact and isn't warehouse-native either. It's also the right home if
more raw BGG-account data shows up later (play history, wishlist changes, etc.) — a real
possibility, not a hypothetical, so worth the one new dataset now rather than retrofitting later.

**Named but deliberately not addressed here:** the actual root cause is that collection
ingestion happens in bgg-predictive-models at all. Every other BGG entity (games) is fetched by
bgg-data-warehouse's own pipeline and lands in `core`, with bgg-predictive-models only ever
consuming and enriching it — collections invert that, with bgg-predictive-models doing the raw
fetch itself and bgg-data-warehouse only reading it back after the fact. A `collections` schema
here is a pragmatic fix for *reading* the data; it does not fix *where the fetch happens*. That's
a real architectural fix to consider later, not in scope for this feature.

## Phase 1 — admin-only filter, using data that already exists

**Status: shipped** (bgg-data-warehouse PR #102, bgg-viewer PR #47).

- **Scope:** only Phil can filter the catalog by a username that already has rows in
  `user_collections` (himself, plus anyone he's already run the CLI for). No new BGG fetch.
- **Admin check:** hardcode `locals.user.email === 'phil.henrickson@gmail.com'` in the viewer's
  server code — **not** a new `is_admin` column on the shared `core.users` table. That table
  also backs dash-viewer, so a schema change there is a wider decision than one admin-only
  feature warrants. Trivially swapped for a real column later if a second admin shows up.
- **UI:** one filter target at a time (pick a username, catalog is filtered by it), not a
  two-collection side-by-side diff. Confirmed as-built.
- **Data flow — settled as (b):** ships the list of owned `game_id`s to the client, loaded into a
  small `owned_collection` DuckDB table (same pattern as `thumbnails`), joined via
  `appendCollectionFilter(where)` — a pure string function that ANDs
  `game_id IN (SELECT game_id FROM owned_collection)` onto whatever `where` the page already
  built. No annotation/badge UI; this is a hard filter, and no change to the shared Arrow
  artifact, cache, or ETag.
- **It's a filter, not a Universe.** Considered promoting "my collection" to a fourth `Scope.universe`
  value (alongside Top 10k / Rated / Upcoming) so ownership never gets silently excluded by an
  unrelated rank cutoff. Decided against: Universe is exclusive-choice, so that would forfeit
  compound questions like "which of my games are also in the Top 10k" — which turned out to be
  exactly the thing worth keeping. Collection stays an AND-composable filter, same family as the
  facet filters (categories, mechanics), which already OR-within/AND-across the same way.
- **Known limitation, not fixed yet:** because it's AND-composed, a game you own can be silently
  absent from a filtered view for reasons that have nothing to do with ownership — narrowed out
  by the current Universe (Top 10k's rank cutoff, Rated's 30-rating floor, Upcoming's year
  bound) or, one layer further down, never shipped in the Arrow artifact at all (`columns.ts`'s
  `WORKING_SET_WHERE` excludes anything under 30 ratings that isn't from this year or later —
  a floor no client-side filter design can see past). The fix isn't a mechanism change, it's
  **visibility**: surface something like "142 of your 160 owned games are in the current view,"
  the same trick `total`/`universeTotal` already uses to make Top 10k's narrowing legible. Not
  built yet — noted here so it doesn't get lost.
- **Chip visibility — shipped.** An active collection filter shows as a removable chip in
  `FilterChips`, alongside every other active filter, cleared individually or via "Clear all" —
  not just from a button buried in the admin picker itself.
- **Future direction, not started:** the filter already generalizes to *multiple* named
  collections with no mechanism change — widen `owned_collection` to `(username, game_id)`,
  make applying additive instead of replace-wholesale, and intersect via
  `HAVING COUNT(DISTINCT username) = N`. That's the "overlap between two collections" question,
  and from the same table a similarity score (Jaccard: intersection ÷ union) falls out for free.
  Deliberately not building this now — parked here because it came up naturally and the current
  design doesn't foreclose it.

## Phase 2 — self-serve, linked at login

The flow: **as part of registering (or later, from a settings page), a user optionally enters
their BGG username. That triggers a background check-and-sync, non-blocking — registration/login
succeeds regardless of whether the sync succeeds — after which a one-click "My collection" toggle
becomes available.** This splits into three genuinely separate pieces of work, one of which is
new infrastructure and two of which reuse what Phase 1 already built.

### 1. Identity — capture and store

- Add `bgg_username` to the account, modeled as **the account's linked BGG identity** in general
  — not narrowly "the field used for the ownership filter." Both this filter and eventual
  collection-predictions integration hang off the same link.
- Lands on `core.users` — the table shared with dash-viewer, so this is a real schema decision
  (unlike Phase 1's deliberately-avoided `is_admin` column, which was skipped precisely because it
  had no use beyond one admin-only debug feature). Confirm it doesn't collide with anything
  dash-viewer does before adding it.
- Captured at registration; a settings page for existing users to add/change it later doesn't
  exist yet and would need building (bgg-viewer currently has no account/settings surface at all).
- No verification step — BGG has no OAuth to verify against, so this is trust-based, same as
  everything else here.

### 2. Check — reuses Phase 1 as-is

The "does this username already have synced data, and how fresh" question is already answered by
Phase 1's reader (`fetchOwnedCollection`, via `collections.user_collections`). No new code needed
for this half — it's the same read path admin's picker already uses.

### 3. Trigger — the new piece: a fire-and-forget sync call, behind a locked-down service

- **New endpoint**, e.g. `POST /sync/{username}` on bgg-predictive-models' existing
  `services/collections` Cloud Run service (`services/collections/main.py` — already runs
  `/predict_own`, `/models`, `/model/{username}/{outcome}/info`), wrapping the existing
  `CollectionPipeline` (currently CLI-only via `cli.py run --username <x>`). No new service to
  stand up.
- bgg-viewer's server calls it **without waiting on the result** when a username is saved (and the
  check says it's missing or stale) — success or failure, registration/login proceeds either way.
  This is what makes the 202/429 BGG-side polling latency a non-issue: it happens entirely inside
  that fire-and-forget call, off the request path the user is waiting on.
- **The service gets locked down as part of this**, applying the pattern already specced in
  bgg-data-warehouse at `docs/superpowers/specs/2026-07-16-service-auth-pattern-design.md`
  (a separate repo — not a relative link, since it won't resolve outside a local checkout where
  the repos happen to sit as siblings; that doc already named predictive-models as the intended
  follow-up target, so this isn't a pattern invented here):
  - `bgg-collection-scoring` (the Cloud Run service backing `services/collections`) redeploys
    `--no-allow-unauthenticated`, replacing its current `allUsers` grant.
  - An authoritative Terraform `run.invoker` `members` list adds
    `serviceAccount:bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com` alongside Phil's own
    `user:` entry.
  - bgg-viewer mints a Google-signed ID token (`google-auth-library`, already a dependency) for
    the call — the TypeScript equivalent of the pattern doc's Python `id_token_headers` helper.
  - This closes one of the five `allUsers`-exposed predictive-models services (`bgg-model-scoring`,
    `bgg-embeddings-service`, `bgg-collection-scoring`, `bgg-text-embeddings-service`,
    `bgg-streamlit-prod`) as a side effect of building this feature, not a separate remediation pass.

### 4. "My collection" toggle

Once identity + synced data exist, this is small: a single button/toggle (not admin's type-a-username
box) that calls `applyCollectionFilter` with the account's own `bgg_username`, wherever the admin
picker currently lives. Admin's arbitrary-username lookup and a regular user's own-collection
toggle become the same underlying mechanism (`applyCollectionFilter` + the chip in `FilterChips`),
differing only in whose username is supplied and how it's obtained.

### Open unknowns

- Whether BGG's 202-queue latency matters for anything beyond the fire-and-forget call's own
  timeout/retry design — since nothing in the UI blocks on it, this is now an operational
  concern (how long before `/sync/{username}` gives up) rather than a UX one.
- Whether `BGG_API_TOKEN` (`collection_loader.py`) is a real BGG requirement or a self-imposed
  one — affects whether `/sync/{username}` needs that secret plumbed through to
  `services/collections`, which doesn't have it today.
- Per-service caller inventory for `bgg-collection-scoring` before it's locked down — the
  auth-pattern doc calls this out as a prerequisite ("identify every current caller") so gating it
  doesn't break the existing collection-scoring GH Actions workflow that already calls it.

## Out of scope (this spec)

- Any UI copy beyond functional placeholders — Phil writes final copy.
- Verifying BGG-username ownership (e.g. a "post this code to your profile" proof) — usernames
  are self-declared and trusted.
- Recurring/scheduled re-sync of a user's collection — Phase 2's trigger fires once, at
  link-time (or when a settings page later allows re-triggering it manually); there is no polling
  job watching anyone's BGG profile for changes.
- A new `is_admin` column on the shared `core.users` table.
- A side-by-side two-collection diff view (though see Phase 1's "future direction" note — an
  N-collection intersection is a different, deliberately-unbuilt idea from a diff view).
- The multi-collection intersection/overlap filter and any collection-similarity metric — noted
  under Phase 1 as a natural extension, not scheduled work.
- Building a general settings/account page — Phase 2 only needs `bgg_username` capturable at
  registration; a fuller settings surface is a separate decision.

## Verification

- **Phase 1 (done):** Dataform compile + `CREATE TABLE` dry-run for the model, `pnpm test` /
  `pnpm run check` / `pnpm build`, manual `just dev` confirming the picker, chip, and clear
  behavior in both light and dark.
- **Phase 2:** confirm `bgg-collection-scoring`'s existing callers (the collection-scoring GH
  Actions workflow, at minimum) still work after it's gated, before/alongside adding
  `/sync/{username}`; a manual end-to-end check that saving a `bgg_username` at registration
  results in a synced row in `collections.user_collections` without blocking the registration
  response; `just check`/`just test` for the new identity field, trigger call, and toggle.
