# BGG Viewer — Collection Filter — Design

**Date:** 2026-08-26
**Status:** Proposed

> Copy note: all user-facing strings implied below are **placeholder** — Phil writes the final copy.

## Goal

Let a logged-in bgg-viewer user filter or annotate the catalog against a BGG collection.
Two phases:

- **Phase 1 (admin only):** filter the catalog by a collection that's already been loaded into
  BigQuery, using the existing collection pipeline's data as-is. No new fetching, no account changes.
- **Phase 2 (self-serve):** any user links their own BGG username and can pull a fresh copy of
  their collection on demand; admin's arbitrary-username lookup becomes the same mechanism with
  a wider scope.

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

- **Scope:** only Phil can filter the catalog by a username that already has rows in
  `user_collections` (himself, plus anyone he's already run the CLI for). No new BGG fetch.
- **Admin check:** hardcode `locals.user.email === 'phil.henrickson@gmail.com'` in the viewer's
  server code — **not** a new `is_admin` column on the shared `core.users` table. That table
  also backs dash-viewer, so a schema change there is a wider decision than one admin-only
  feature warrants. Trivially swapped for a real column later if a second admin shows up.
- **UI:** one filter target at a time (pick a username, catalog is filtered/annotated by it),
  not a two-collection side-by-side diff. **Assumption to confirm with Phil**: "compare" meant
  swappable single-target viewing, not simultaneous two-collection display.
- **Data flow — decide during planning:** either (a) bake an `owned`/`want`/`rating` join into
  the per-session Arrow artifact for the selected username (needed if the UI *annotates* every
  row, e.g. a badge), or (b) ship just the list of owned `game_id`s to the client for a
  DuckDB-side `WHERE IN` (sufficient if the UI only *hides* non-collection games). These aren't
  equivalent — pick based on whether annotation or hard filtering is the actual UX.

## Phase 2 — self-serve, on demand

- Add a self-declared `bgg_username` field to the user's account, modeled as **the account's
  linked BGG identity** in general — not narrowly "the username used for the ownership filter".
  Both the ownership filter and eventual collection-predictions integration hang off the same
  link, so it should read as an identity field from day one rather than being renamed/repurposed
  later. No verification step — BGG has no OAuth to verify against, so this is trust-based like
  everything else here.
- A "sync" action fetches a fresh collection for that username through a small wrapper around
  the existing `BGGCollectionLoader` / `CollectionStorage`, exposed **from bgg-predictive-models**
  (where the loader, `BGG_API_TOKEN` handling, and 202/429 polling already live) rather than
  reimplemented in bgg-viewer's Node server.
- Admin's arbitrary-username lookup becomes this same endpoint with a wider scope — once Phase 2
  ships, Phase 1's hardcoded admin path can likely retire in favor of "admin can sync any
  username, regular users only their own."

### Open unknowns (must resolve before Phase 2 planning, not before Phase 1)

- Whether BGG's 202-queue latency is long enough in practice that a "sync now" button needs an
  async "check back" UI rather than a blocking request — needs a timed spike against a cold
  username.
- Whether `BGG_API_TOKEN` (`collection_loader.py`) is a real BGG requirement or a self-imposed
  one — changes how much auth plumbing the viewer→predictive-models bridge needs.
- Where the sync endpoint should live operationally in bgg-predictive-models (existing Cloud Run
  service vs. a new one) and how it's authenticated from bgg-viewer's server — ties into the
  already-tracked public-Cloud-Run-services gap for that project.

## Out of scope (this spec)

- Any UI copy beyond functional placeholders — Phil writes final copy.
- Verifying BGG-username ownership (e.g. a "post this code to your profile" proof) — usernames
  are self-declared and trusted.
- Automatic/background re-sync of a user's collection — refresh is always user-initiated
  (Phase 2) or manual CLI (Phase 1), never a polling job watching someone's BGG profile.
- A new `is_admin` column on the shared `core.users` table.
- A side-by-side two-collection diff view.

## Verification

- **Phase 1:** Dataform compile + `CREATE TABLE` dry-run for the new model (per this repo's
  Dataform validation convention — a bare `SELECT` dry-run isn't sufficient), `just check`,
  `just dev` confirming the admin-only picker filters/annotates correctly in both light and dark.
- **Phase 2:** a timed manual test of BGG's collection endpoint worst-case latency before
  locking in the sync UI's request shape; `just check` / `just test` for the new sync action and
  any new scope/query helpers.
