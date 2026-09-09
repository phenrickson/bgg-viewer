# Fix: bgg-viewer can't read collections — settings page 500

## Context

The deployed settings page (`boardgame-viz.com/settings`) returns 500 for the admin
account while working locally. Cloud Run logs give the exact cause:

```
Error: Access Denied: Table bgg-data-warehouse:collections.user_collections:
User does not have permission to query table ... or perhaps it does not exist.
```

`load` in `bgg-viewer/src/routes/(app)/settings/+page.server.ts:22` calls
`fetchOwnedCollection` unguarded, so the denial becomes a 500. It works locally only
because local ADC runs as a project owner; the deployed service runs as
`bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`.

The read crosses a project boundary. `bgg-data-warehouse.collections.user_collections`
is a **VIEW**:

```sql
SELECT username, game_id, owned, want, user_rating, updated_at
FROM `bgg-predictive-models.collections.user_collections`
WHERE removed_at IS NULL
```

BigQuery runs a view's query as the *caller* unless the view is authorized on the
source dataset. Both links are missing today:

| Link | State |
|---|---|
| `bgg-viewer@` reads `bgg-data-warehouse:collections` | **missing** — not in the dataset ACL |
| Warehouse view authorized on `bgg-predictive-models:collections` | **missing** — no `view` entry in the source ACL |

Everything else in the chain is already provisioned and verified live:
`COLLECTION_SYNC_SERVICE_URL` repo var is set; `bgg-viewer@` holds `run.invoker` on
`bgg-collection-scoring` (confirmed in the live IAM policy, `allUsers` already removed);
`bgg-viewer@` holds project-level `bigquery.jobUser` on the warehouse project.

**Intended outcome:**
1. Users can link their BGG collection from `/settings`.
2. Admin can filter Explore to any collection already loaded into the view.

Note this currently breaks the *write* half too, not just rendering: `triggerSync`
calls `fetchOwnedCollection` first on the non-forced path
(`bgg-viewer/src/lib/server/collections/sync.ts:43`); that throws, is swallowed by its
own try/catch, and returns `false` — so a new link never fires a sync. Both grants fix
this without a code change.

## Affected files/systems

- `bgg-predictive-models/terraform/bigquery.tf` — new `google_bigquery_dataset_access`
  authorizing the warehouse view (dataset + table at lines 574–608).
- `bgg-data-warehouse/terraform/viewer.tf` — new `google_bigquery_dataset_iam_member`
  granting `bgg-viewer@` read on `collections`.
- No application code changes. No schema, pipeline, Dataform, or backfill changes.

## Steps

### 1. PR A — authorize the warehouse view on the source dataset

Repo: `bgg-predictive-models`, branch `fix/authorize-collections-view-for-warehouse`.
PR: phenrickson/bgg-predictive-models#74.

Add to `terraform/bigquery.tf`, immediately after the `user_collections` table
resource, with a comment explaining the cross-project view relationship:

```hcl
resource "google_bigquery_dataset_access" "collections_authorized_view_warehouse" {
  dataset_id = google_bigquery_dataset.collections.dataset_id
  project    = var.project_id

  view {
    project_id = "bgg-data-warehouse"
    dataset_id = "collections"
    table_id   = "user_collections"
  }
}
```

Chosen over granting `bgg-viewer@` direct `dataViewer` on this project's dataset: the
authorized view keeps the viewer's identity entirely out of `bgg-predictive-models`,
and it reads only through the view's `removed_at IS NULL` filter rather than the raw
table.

Safe to add as a separate resource — `google_bigquery_dataset.collections`
(`bigquery.tf:574`) declares no inline `access` blocks, so there is no authoritative
resource to fight. The existing `google_bigquery_dataset_iam_member` in `iam.tf:138` is
also non-authoritative and coexists fine.

**Verification:** the PR's `terraform plan` (posted by `.github/workflows/terraform.yml`)
shows exactly one resource to add. After merge to `main` applies it:
`bq show --format=prettyjson bgg-predictive-models:collections` includes a `view` entry
pointing at `bgg-data-warehouse.collections.user_collections`.

### 2. PR B — grant the viewer SA read on the warehouse dataset

Repo: `bgg-data-warehouse`, branch `fix/bgg-viewer-collections-read`.
PR: phenrickson/bgg-data-warehouse#113.

Add to `terraform/viewer.tf`, alongside the existing `predictions` grant and following
its established pattern — literal `dataset_id` because the `collections` dataset is
Dataform-created and not managed by this config, and a non-authoritative `_iam_member`
so it adds a grant without disturbing Dataform's ownership:

```hcl
resource "google_bigquery_dataset_iam_member" "bgg_viewer_collections_viewer" {
  dataset_id = "collections"
  project    = var.project_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.bgg_viewer.email}"
}
```

**Verification:** the PR plan (which `.github/workflows/terraform.yml` deliberately runs
against `prod` for fidelity) shows one resource to add. After merge:
`bq show --format=prettyjson bgg-data-warehouse:collections` lists `bgg-viewer@` as
READER.

### 3. End-to-end verification

Both PRs must land before anything changes — each alone just moves the `Access Denied`
one hop. They are independent and additive, so merge order does not matter. No redeploy
of bgg-viewer is needed; IAM takes effect on the running revision within seconds.

- **Goal 1:** load `/settings` as admin. The Collection sync row renders with a game
  count and "last synced". Click "Refresh from BGG" — the client polls
  `/api/collection` and the message flips to "Refreshed."
- **Goal 1 (fresh link):** clear the BGG username, save, re-enter it, save. The sync
  trigger should now fire rather than silently returning `false`.
- **Goal 2:** in Explore, use the admin collection picker with a different loaded
  username; the "My Collection" filter applies.
- **Logs:** `gcloud logging read` on `bgg-viewer` at `severity>=ERROR` with a short
  freshness window returns no new `Access Denied` entries.

## Risks / unknowns / rollback

- **Low risk, fully reversible.** Both changes are additive ACL/IAM entries. No data is
  moved or rewritten, no schema changes, no backfill, no BigQuery scan cost.
- **Rollback:** revert either PR; `terraform.yml` applies the removal on merge to `main`.
- **Watch on PR A's plan:** confirm it reports *only* the one addition. If it also shows
  changes to the `collections` dataset's existing access entries, stop — that would mean
  the provider is trying to take authoritative control of the ACL, which is not intended.
- **Dataform interaction:** the warehouse `collections` dataset is Dataform-owned. A
  non-authoritative `_iam_member` should survive Dataform runs — this is the same pattern
  the `predictions` grant already relies on. If the grant disappears after a Dataform
  full-refresh, that assumption needs revisiting.
- **Unknown, non-blocking:** which usernames are actually populated in the view. Only
  affects how thoroughly goal 2 can be exercised, not whether the fix is correct.

## Out of scope

- **Hardening the settings `load`** so a collections outage degrades to a hidden panel
  instead of a 500. Worth doing — it's why a permissions gap took the whole page down —
  but it is not needed for either goal and would mask the very error that made this
  diagnosable. Proposed as a follow-up.
- Any change to `bgg-viewer` application code, the collections service, or the sync flow.
- Managing the warehouse `collections` dataset or its view in Terraform.
