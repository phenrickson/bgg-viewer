# Deploying bgg-viewer — Cloud Run, Terraform, versioned rollouts

**Date:** 2026-08-03
**Status:** proposed

## Goal

Get bgg-viewer onto a public URL, behind its existing app login gate, so it can be
shared with a handful of people. Infrastructure and IAM managed by Terraform; deploys
driven by GitHub Actions with release-please cutting semver releases and blue/green
rollout so a bad release can be rolled back by a traffic flip.

Prod only. No dev service.

## Established pattern this follows

Three sibling deployments were reviewed. The design borrows deliberately from each:

| Source | What is borrowed |
| --- | --- |
| `bgg-dash-viewer/.github/workflows/cloud-run-deploy.yml` | Cloud Run in `bgg-data-warehouse`/`us-central1`, public with `--allow-unauthenticated`, app-level login gate |
| `bgg-data-warehouse/terraform/warehouse_api.tf` | IAM as *authoritative* Terraform bindings; grants live in code, reviewed and git-audited |
| `aebs-data-warehouse/.github/workflows/release-please.yml` + `rollback.yml` | release-please with config+manifest, `stable`-tagged revision for blue/green, `workflow_dispatch` rollback |

Deliberate divergences from the BGG siblings:

- **Workload identity federation instead of an SA key.** Both BGG repos use a
  long-lived `credentials_json` secret; aebs uses WIF. Terraform is already being
  stood up for this service, so the pool/provider is a small addition and it removes
  the only long-lived credential from the design. *If WIF proves troublesome to set
  up, the fallback is a `credentials_json` secret exactly as dash-viewer does it —
  this is the one decision flagged for reconsideration during implementation.*
- **`runs-on: ubuntu-latest`**, not aebs's `[self-hosted, etl]` runners.
- **Secret Manager (`--set-secrets`)**, not `--set-env-vars`, for the two auth
  secrets. dash-viewer passes `SECRET_KEY`/`REGISTRATION_CODE` as plain env vars,
  which leaves them readable in the Cloud Run console. `SESSION_SECRET` signs session
  cookies, so it is worth the one extra setup step.

## Architecture

### Runtime

SvelteKit with `adapter-node` (configured inline in `vite.config.ts`, not a separate
`svelte.config.js`). `pnpm build` emits `build/`; the server entry is
`node build/index.js`, listening on `PORT`. A multi-stage Dockerfile installs with a
frozen lockfile, builds, then ships only production deps plus `build/`.

### Identity and access

A **dedicated** service account, `bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`,
rather than reusing the shared `bgg-data-warehouse@` SA that dash-viewer and
warehouse-api both run as. Dedicated identity means the warehouse invoker grant
names this app specifically, and its BigQuery access can be scoped and revoked
independently.

It needs:

- BigQuery read on `analytics.games_features`, `analytics.best_player_counts`,
  `predictions.bgg_predictions` (the catalog artifact joins all three), plus
  read/write on `core.users` for login and registration, plus `bigquery.jobUser`
  to run queries.
- `roles/secretmanager.secretAccessor` on the two secrets below.
- `roles/run.invoker` on `bgg-warehouse-api` — see the blocker.

### Blocking prerequisite: the warehouse invoker grant

`bgg-data-warehouse/terraform/warehouse_api.tf` declares
`warehouse_api_invoker_members` with a single member,
`user:phil.henrickson@gmail.com`. It is an **authoritative**
`google_cloud_run_v2_service_iam_binding`, so it is the complete allow-list and
cannot be patched out of band.

In production `getWarehouseIdToken()` takes the `mintIdToken()` path — a token for
the *runtime service account*, not a user. That identity is not on the list, so
**every game detail page will 403 until `serviceAccount:bgg-viewer@...` is added to
`warehouse_api_invoker_members`** and `terraform.yml` applies it.

This is a PR in the **bgg-data-warehouse** repo and must merge before the first
viewer deploy is expected to work end to end.

### Secrets

Two secrets in Secret Manager, injected with `--set-secrets`:

- `bgg-viewer-session-secret` → `SESSION_SECRET`
- `bgg-viewer-registration-code` → `REGISTRATION_CODE`

Non-secret configuration goes through `--set-env-vars`: `GCP_PROJECT_ID`,
`WAREHOUSE_API_URL`, `VERSION`.

Secret *versions* are created manually, once, outside Terraform — Terraform creates
the containers and IAM but never holds the values.

### Access model

Public URL (`--allow-unauthenticated`) with the app's own login gate in front of
everything. Registration stays as it is today: `registerSchema` requires a non-empty
`registration_code`, compared against `env.REGISTRATION_CODE`. Set it to a short
memorable phrase and share it alongside the link.

**No application code changes.** Note that leaving `REGISTRATION_CODE` unset does not
relax this check — the field is required and would be compared against `undefined`,
so registration would fail closed for everyone. The secret must be populated.

### Versioned rollout

`release-please-config.json` (`release-type: node`, reading `package.json`) plus
`.release-please-manifest.json` seeded at the current `0.0.1`.

Single workflow, `.github/workflows/release-please.yml`, on push to `main`:

1. **`release-please` job** — opens/updates the release PR. Merging it creates a
   release and sets `release_created`, `version`, `tag_name`.
2. **`deploy` job** — `if: needs.release-please.outputs.release_created == 'true'`.
   Pushes to main that are not a release merge build nothing; only a merged release
   PR deploys.
   - Build and push `bgg-viewer:${VERSION}` and `:latest` to Artifact Registry.
   - **Tag the currently-serving revision `stable`** before deploying — this is what
     makes rollback possible, so it happens first.
   - Deploy the new revision with `VERSION` injected as an env var.

`.github/workflows/rollback.yml`, `workflow_dispatch` only: show current traffic,
`gcloud run services update-traffic bgg-viewer --to-tags stable=100`, then print the
resulting allocation to verify.

Because `stable` is re-tagged on every release, rollback always returns to the
previously-serving revision — one release back, not an arbitrary history.

## Dev-only flags in production

Two flags would be dangerous in a public deploy, and both are **already** correctly
gated — verified, not assumed:

- `DEV_AUTH_EMAIL` fabricates a logged-in user, bypassing login entirely.
  `src/hooks.server.ts:19` guards it with `!user && dev && env.DEV_AUTH_EMAIL`.
- `OFFLINE` serves a stale cached catalog. `src/lib/server/offline.ts:19` guards it
  with `dev && ...`.

`dev` is a compile-time constant that is `false` in a production build, so neither can
be switched on by environment in prod. This is a verification step in the plan, not
new work: confirm neither variable is set on the service, and confirm the deployed app
presents a login screen to an anonymous request.

## Components

| Unit | Responsibility | Lives in |
| --- | --- | --- |
| `Dockerfile` | Reproducible image from lockfile → `build/` → node runtime | bgg-viewer |
| `.dockerignore` | Keep `node_modules`, `.env`, `.cache`, `build` out of context | bgg-viewer |
| `release-please-config.json`, `.release-please-manifest.json` | Version/changelog policy | bgg-viewer |
| `release-please.yml` | Release PR + gated blue/green prod deploy | bgg-viewer |
| `rollback.yml` | Manual traffic flip to `stable` | bgg-viewer |
| `terraform/viewer.tf` | `bgg-viewer@` SA, BQ + secret IAM, secret containers, WIF binding | bgg-data-warehouse |
| `warehouse_api.tf` (edit) | Add the viewer SA to the invoker allow-list | bgg-data-warehouse |

Terraform for this service lives in **bgg-data-warehouse**, where the project's
existing IaC and its `terraform.yml` apply workflow already are. Splitting Terraform
state across two repos to keep the viewer's config next to its code would cost more
than it gains.

## Failure modes

| Failure | Surfaces as | Handling |
| --- | --- | --- |
| Viewer SA not on warehouse invoker list | Game detail pages 403; catalog still fine | The blocker above; merge the warehouse PR first |
| Secret version never populated | Login/registration fail; server reports misconfiguration | Create both secret versions before first deploy |
| Bad release reaches prod | Broken public URL | `rollback.yml` → traffic to `stable` |
| BigQuery access missing | App boots, "Catalog failed to load" | Grant checked during Terraform apply |
| First request slow | ~40 MB BigQuery scan on cold start, then cached ~6h | Accepted; `min-instances` deferred unless it becomes annoying |

## Ordering

The dependency that matters: **Terraform before Actions** (the deploy needs the SA,
the secrets, and WIF to exist), and **the warehouse invoker PR before the first
deploy** (or detail pages 403).

1. Warehouse repo: add viewer SA to `warehouse_api_invoker_members`; apply.
2. Warehouse repo: `terraform/viewer.tf` — SA, BQ roles, secret containers +
   accessor, WIF pool/provider/binding; apply.
3. Manually create both secret versions.
4. bgg-viewer: `Dockerfile` + `.dockerignore`; verify `docker build` and that the
   container serves locally.
5. bgg-viewer: release-please config + manifest at `0.0.1`.
6. bgg-viewer: `release-please.yml` and `rollback.yml`.
7. Merge to main → merge the release PR → confirm deploy, login gate, catalog, and a
   game detail page.
8. Verify rollback once, deliberately, while nothing is at stake.

Step 8 matters: an untested rollback is not a safety net. Exercise it before it is
needed.

## Out of scope

Custom domain; a dev/staging service; `min-instances` warm-start; monitoring and
alerting; migrating users off dash-viewer (both run side by side); any change to the
login/registration flow.
