# Collection Filter (Phase 2, Self-Serve) — Implementation Plan

**Date:** 2026-08-27
**Spec:** [2026-08-26-collection-filter-design.md](../specs/2026-08-26-collection-filter-design.md)
(Phase 2 section)
**Branches:** `feat/collection-sync-endpoint`, `feat/gate-collection-scoring-iam`,
`feat/gate-collection-scoring-flag` (bgg-predictive-models); `feat/users-bgg-username`
(bgg-data-warehouse); `feat/bgg-username-link`, `feat/my-collection-toggle` (bgg-viewer)

## Goal & success criteria

A user who enters their BGG username at registration gets it fetched into
`collections.user_collections` in the background — registration succeeds immediately
regardless of the fetch's outcome — after which a "My collection" toggle works for them the
same way the admin picker already does. Done when: `bgg-collection-scoring` is no longer
publicly invokable, the daily collection-scoring cron still works after that change, and all
three repos' verify commands pass.

## Corrections found while reading the code (before planning against assumptions)

1. **The new endpoint wraps `fetch_and_persist`, not `CollectionPipeline`.**
   `CollectionPipeline.run_full_pipeline()` (`collection_pipeline.py:161`) trains a model per
   outcome — tuning, splits, GCS artifacts — which is the collection-*predictions* machinery,
   a separate, not-yet-built capability. `fetch_and_persist(username, environment)`
   (`collection_pipeline.py:95-107`) is a free function that does exactly what Phase 2 needs:
   `BGGCollectionLoader.get_collection()` → `CollectionStorage.save_collection()`. Wrapping the
   full pipeline would silently start training a personalized model on every registration.
2. **`BGG_API_TOKEN` is hard-required, confirmed by reading `collection_loader.py:40-42`**
   (`raise ValueError` if unset) — not the open question the spec left it as.
   `docker-collections-build.yml`'s current `--set-env-vars` list doesn't include it, so the new
   endpoint will 500 on every call until it's added.
3. **`bgg-collection-scoring` isn't Terraform-managed** — it's deployed imperatively
   (`gcloud run deploy ... --allow-unauthenticated` in `docker-collections-build.yml`), no
   `google_cloud_run_v2_service` resource exists for it. This turns out not to matter: it's the
   same shape `bgg-warehouse-api` already uses (`bgg-data-warehouse/terraform/warehouse_api.tf`)
   — Terraform owns *only* the IAM binding, referencing the service by name/location with no
   dependency on how it's deployed. Applying it needs the IAM binding and the deploy-flag flip
   to land as **two separate merges, in that order** (see Part B).
4. **No new client-side auth code needed.** `src/lib/server/warehouse/token.ts`'s
   `mintIdToken(audience)` is already general-purpose and cached per audience — calling
   `/sync/{username}` is a second call to the same helper with a different URL.

## Affected files

**bgg-predictive-models:**
- `services/collections/main.py` — new `POST /sync/{username}`, wrapping `fetch_and_persist`.
- `.github/workflows/docker-collections-build.yml` — add `BGG_API_TOKEN` to `--set-env-vars`
  (Part A); later, flip `--allow-unauthenticated` → `--no-allow-unauthenticated` (Part B, second
  merge).
- `terraform/collections_service.tf` (**new**, mirrors `warehouse_api.tf`'s shape) —
  authoritative `google_cloud_run_v2_service_iam_binding` for `bgg-collection-scoring`
  (Part B, first merge).
- New repo secret: `BGG_API_TOKEN` (Phil's existing token, added to GH Actions secrets for both
  PROD/DEV environments used by `docker-collections-build.yml`).

**bgg-data-warehouse:**
- `terraform/auth.tf` — add `bgg_username` (`STRING`, `NULLABLE`) to the `users` table schema
  (Part C). Additive/nullable — Terraform applies this as an in-place patch, not a recreate.

**bgg-viewer:**
- `src/lib/schemas.ts` — `registerSchema` gains optional `bgg_username`.
- `src/lib/server/auth/users.ts` — `DbUser`/`createUser` gain `bgg_username`.
- `src/routes/register/+page.server.ts` — capture the field; fire the sync trigger, not awaited.
- `src/routes/register/+page.svelte` — optional input.
- `src/lib/server/collections/sync.ts` (**new**) — `triggerSync(username)`: check freshness via
  Phase 1's `fetchOwnedCollection`, and if missing/stale, `mintIdToken` + `POST /sync/{username}`,
  catching and logging any error rather than propagating it.
- A "My collection" toggle wired into wherever `AdminCollectionPicker` currently mounts — reuses
  `applyCollectionFilter`/`clearCollectionFilter` verbatim (Part E, separate PR from Part D).
- New env var: `COLLECTION_SYNC_SERVICE_URL` (the `bgg-collection-scoring` Cloud Run URL).

## Steps

### Part A — bgg-predictive-models: the endpoint (service still public)

1. **Endpoint.** `POST /sync/{username}` in `services/collections/main.py`, calling
   `fetch_and_persist(username, environment)` from `src/collection/collection_pipeline.py`.
   Returns `{username, rows_persisted}` or a 502 on fetch failure (BGG down, invalid username,
   etc.) — this is a fire-and-forget caller's problem to log, not retry synchronously.
2. **Add `BGG_API_TOKEN`** to the GH Actions secrets (PROD + DEV environments) and to
   `docker-collections-build.yml`'s `--set-env-vars` for the deploy step.
   **Verify:** deploy to DEV, `curl -X POST .../sync/phenrickson` against the still-public
   service, confirm a row lands/updates in `bgg-predictive-models.collections.user_collections`
   with a fresh `updated_at`.
3. **PR + merge.** Push `feat/collection-sync-endpoint`, open PR, **Phil merges** — triggers
   `docker-collections-build.yml` automatically (path filter already covers
   `services/collections/**`).

### Part B — bgg-predictive-models: lock it down (two separate merges, in order)

4. **Caller inventory.** Confirm every current caller of `bgg-collection-scoring`: the
   `run-collection-scoring.yml` cron (authenticates via `GCP_SA_KEY_BGG_ML`/`terraform-admin`,
   which already holds project-level `run.admin` — a superset of `run.invoker` — so it should
   keep working without being added to the new list; verify this empirically in step 6, don't
   just trust the IAM hierarchy). No other caller found in this repo.
5. **Terraform IAM binding.** `terraform/collections_service.tf`, mirroring
   `warehouse_api.tf`'s exact shape: `google_cloud_run_v2_service_iam_binding` for
   `bgg-collection-scoring`, `members = ["user:phil.henrickson@gmail.com", "serviceAccount:bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com"]`.
   **PR + merge first** (`feat/gate-collection-scoring-iam`) — safe on its own, since `allUsers`
   is still separately granted at this point; this only *adds* specific invokers.
   **Verify:** `gcloud run services get-iam-policy bgg-collection-scoring` shows both new members
   alongside the still-present `allUsers`.
6. **Flip the deploy flag.** `docker-collections-build.yml`: `--allow-unauthenticated` →
   `--no-allow-unauthenticated`. **PR + merge second** (`feat/gate-collection-scoring-flag`),
   only after step 5 is merged and applied.
   **Verify:** post-merge, `gcloud run services get-iam-policy bgg-collection-scoring` no longer
   lists `allUsers`; `curl` the service with no auth header → 403; the next scheduled (or
   manually `workflow_dispatch`ed) `run-collection-scoring.yml` run still succeeds — confirms
   `terraform-admin`'s existing `run.admin` role does cover this without a members-list entry.

### Part C — bgg-data-warehouse: schema

7. **Add `bgg_username`** to `terraform/auth.tf`'s `users` table schema (`STRING`, `NULLABLE`).
   **Verify:** `terraform plan` shows an in-place column addition, not a table recreate
   (`deletion_protection = true` would block a recreate anyway — this is the safety net, not the
   primary check). PR + merge.

### Part D — bgg-viewer: capture + trigger (needs Parts A–C merged first)

8. **Schema + reader.** `registerSchema` gains optional `bgg_username` (trimmed, no format
   validation — self-declared per the spec); `DbUser`/`createUser` in `users.ts` gain the field.
   **Verify:** unit test on the schema (valid/empty both accepted).
9. **Trigger.** `src/lib/server/collections/sync.ts`: `triggerSync(username)` — call
   `fetchOwnedCollection(username)`, and if `game_ids.length === 0` or `updated_at` is stale
   (threshold TBD, e.g. >24h), `mintIdToken(COLLECTION_SYNC_SERVICE_URL)` and
   `POST /sync/{username}`. Wrapped in try/catch that only logs — never throws.
   **Verify:** unit test with injected fetch/token mocks — confirms it's called for a
   missing/stale username, skipped for a fresh one, and that a thrown error inside it never
   propagates.
10. **Wire into registration.** `+page.server.ts` calls `void triggerSync(form.data.bgg_username)`
    (not awaited) after `createUser` succeeds, only if the field was provided.
    **Verify:** `just dev`, register with a real BGG username, confirm the registration
    redirect is immediate (no visible delay) and a synced row appears in
    `collections.user_collections` (via bgg-data-warehouse's view) shortly after.
11. **PR + merge.** `pnpm test`/`pnpm run check`/`pnpm build`, push `feat/bgg-username-link`,
    open PR, **Phil merges**.

### Part E — bgg-viewer: the toggle

12. **"My collection" toggle** — reuses `applyCollectionFilter`/`clearCollectionFilter` exactly as
    built in Phase 1, auto-supplying `locals.user`'s own `bgg_username` instead of admin's typed
    input; same `FilterChips` `extra`-chip mechanism for visibility/clearing.
    **Verify:** `just dev` — a linked non-admin account sees the toggle, an unlinked one doesn't;
    both light and dark.
13. **PR + merge.** Push `feat/my-collection-toggle`, open PR, **Phil merges**.

## Risks / unknowns / rollback

- **The IAM-lockdown ordering (Part B) is the one genuinely risky step** — reversing steps 5/6,
  or merging them together, risks a window where `run-collection-scoring.yml`'s daily cron has
  no access at all. Mitigated by the two-separate-merges sequencing above; if it does break,
  rollback is re-adding `--allow-unauthenticated` and redeploying, or widening the Terraform
  members list — nothing here is destructive to data.
- **`terraform-admin`'s `run.admin` covering the cron without an explicit members-list entry is
  reasoned from IAM role hierarchy, not yet verified empirically** — step 6's verification is
  the actual check; if it doesn't hold, add `serviceAccount:` for that SA explicitly to the
  members list as a follow-up, no redesign needed.
- **`BGG_API_TOKEN` is a personal credential** — confirm it's added as a GH Actions *secret*
  (masked), not a plain env var, consistent with how other tokens are already handled in this
  repo's workflows.
- **Staleness threshold for "sync if stale"** (step 9) is a real number to pick, not specified
  here — start conservative (e.g. 24h) and adjust; it only affects how eagerly a re-sync fires,
  nothing structural.
- **Nothing here is a one-way door**: every new file/column is additive, the IAM change is
  reversible by re-adding `allUsers`, and `fetch_and_persist` already exists and is already
  exercised by the CLI — the endpoint is a thin wrapper, not new fetch logic.

## Out of scope

Per the spec: any settings page beyond the registration-time field, re-verifying/re-syncing on
a schedule, the multi-collection intersection filter, and collection-predictions integration
(training personalized models) — `fetch_and_persist` deliberately stops short of
`CollectionPipeline`'s training step, and this plan does not add a path to trigger training from
bgg-viewer.
