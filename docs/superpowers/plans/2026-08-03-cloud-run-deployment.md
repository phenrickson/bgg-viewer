# bgg-viewer Cloud Run Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy bgg-viewer to a public Cloud Run URL behind its existing app login gate, with Terraform-managed identity/IAM and release-please-driven versioned rollouts that can be rolled back with a single traffic flip.

**Architecture:** A dedicated `bgg-viewer@` service account and all its IAM live in the `bgg-data-warehouse` repo's existing Terraform (that is where the project's IaC and its apply workflow already are). The app repo gains a multi-stage Dockerfile plus two workflows: release-please opens release PRs and, on a merged release, builds a semver-tagged image and deploys it blue/green — tagging the outgoing revision `stable` first so `rollback.yml` can flip traffic back.

**Tech Stack:** SvelteKit 2 + `adapter-node`, pnpm, Docker, Cloud Run, Terraform 1.9.8, GitHub Actions, `googleapis/release-please-action@v4`, Secret Manager.

**Spec:** `docs/superpowers/specs/2026-08-03-deployment-design.md`

## Global Constraints

- GCP project `bgg-data-warehouse`; region `us-central1`; BigQuery location `US`.
- Prod only. Do not create a dev/staging service.
- Node `>=20` (`engines` in `package.json`); pnpm with a frozen lockfile.
- Runtime service account: `bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`.
- Cloud Run service name: `bgg-viewer`. Image: `gcr.io/bgg-data-warehouse/bgg-viewer`.
- Terraform `>= 1.0` (CI pins 1.9.8); google provider `~> 5.0`; GCS backend
  `bgg-data-warehouse-terraform-state`, prefix `terraform/state`.
- Terraform files must pass `terraform fmt -check` and `terraform validate`.
- Every Terraform `plan`/`apply` in CI passes `-var="project_id=bgg-data-warehouse"`
  and `-var="environment=prod"`. Match existing label conventions:
  `environment = var.environment`, `managed_by = "terraform"`.
- **No application source changes.** This plan touches infrastructure, Docker, CI, and
  docs only. `src/` is not modified.
- Secret *values* are never committed and never written by Terraform — Terraform
  creates the secret containers and IAM; versions are added manually via `gcloud`.

### Deviation from the spec — deploy credential

The spec recommended workload identity federation. While mapping the repo it turned
out that **`bgg-data-warehouse/.github/workflows/terraform.yml` itself authenticates
with `credentials_json: ${{ secrets.GCP_SA_KEY_BGG_DW }}`**, and no WIF pool exists
anywhere in the project. Adding WIF for only the viewer deploy would introduce new
machinery while leaving a long-lived key in the very same repo — most of the benefit
unrealised for most of the cost.

**This plan therefore uses `credentials_json` with the existing `GCP_SA_KEY_BGG_DW`
secret**, matching bgg-dash-viewer, deploy-warehouse-api, and terraform.yml. Migrating
every workflow in both repos to WIF is worth doing as its own piece of work; it is out
of scope here. Raise this with the plan's owner if you disagree before starting Task 1.

## File Structure

**In `bgg-data-warehouse` (separate repo — Terraform and its apply workflow live there):**

| File | Responsibility |
| --- | --- |
| `terraform/viewer.tf` (create) | The `bgg-viewer@` SA, its BigQuery + Secret Manager IAM, and the two secret containers. One file, one app. |
| `terraform/warehouse_api.tf` (modify) | Add the viewer SA to `warehouse_api_invoker_members`. |
| `terraform/outputs.tf` (modify) | Output the viewer SA email so the deploy workflow's value is discoverable. |

**In `bgg-viewer`:**

| File | Responsibility |
| --- | --- |
| `Dockerfile` (create) | Multi-stage: deps → build → slim runtime serving `build/index.js`. |
| `.dockerignore` (create) | Keep `node_modules`, `.env*`, `.cache`, `build`, `.git` out of the build context. |
| `release-please-config.json` (create) | Release policy — `release-type: node`, single package at the repo root. |
| `.release-please-manifest.json` (create) | Current version, seeded from `package.json`. |
| `.github/workflows/release-please.yml` (create) | Release PR job + release-gated blue/green deploy job. |
| `.github/workflows/rollback.yml` (create) | `workflow_dispatch` traffic flip to the `stable` tag. |
| `README.md` (modify) | A Deployment section: URL, how a release happens, how to roll back. |

Terraform is split by *app*, not by resource type — `viewer.tf` holds everything that
exists solely for bgg-viewer, following how `warehouse_api.tf` scopes itself to one
service. The invoker-list edit is the one exception, because that binding is
authoritative and must stay in a single place.

---

### Task 1: Grant the viewer SA access (Terraform in `bgg-data-warehouse`)

This is the blocker from the spec: in production the app mints an ID token for its
*runtime service account*, and `warehouse_api_invoker_members` is an **authoritative**
binding currently listing only `user:phil.henrickson@gmail.com`. Until the SA is on
that list, every game detail page 403s.

Terraform has no test harness here; `plan` is the test. Read the plan output rather
than trusting the diff.

**Files:**
- Create: `~/Documents/projects/bgg-data-warehouse/terraform/viewer.tf`
- Modify: `~/Documents/projects/bgg-data-warehouse/terraform/warehouse_api.tf:26` (the `default` of `warehouse_api_invoker_members`)
- Modify: `~/Documents/projects/bgg-data-warehouse/terraform/outputs.tf` (append)

**Interfaces:**
- Consumes: existing `var.project_id`, `var.region`, `var.environment`,
  `google_bigquery_dataset.bgg_data` (`core`), `google_bigquery_dataset.bgg_analytics` (`analytics`).
- Produces: service account email `bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`
  (Task 4 sets it as the Cloud Run runtime SA); secret ids `bgg-viewer-session-secret`
  and `bgg-viewer-registration-code` (Task 2 populates them, Task 4 mounts them).

- [ ] **Step 1: Create `terraform/viewer.tf`**

Note `predictions` is **not** a Terraform-managed dataset in this repo (only `core`,
`raw`, `analytics` are), so its grant uses a literal `dataset_id` rather than a
resource reference. `google_bigquery_dataset_iam_member` is non-authoritative — it adds
one member and leaves other grants alone — so this is safe on an unmanaged dataset.

```hcl
# =============================================================================
# bgg-viewer — SvelteKit front-end on Cloud Run (public URL, app-level login gate).
#
# Dedicated least-privilege SA rather than reusing bgg-data-warehouse@ (which
# bgg-dash-viewer and the warehouse API share): the viewer's warehouse-API invoker
# grant then names this app specifically, and its BigQuery access can be revoked
# without touching the pipeline. Same rationale as bgg-thing-ids-scraper in iam.tf.
#
# The Cloud Run *service* is deployed by the app repo's release-please workflow
# (bgg-viewer/.github/workflows/release-please.yml). Terraform owns identity, IAM,
# and the secret containers only — never the service, never the secret values.
#
# See bgg-viewer/docs/superpowers/specs/2026-08-03-deployment-design.md
# =============================================================================

resource "google_service_account" "bgg_viewer" {
  account_id   = "bgg-viewer"
  display_name = "BGG Viewer (SvelteKit front-end)"
  description  = "Runtime SA for the bgg-viewer Cloud Run service"
  project      = var.project_id
}

# --- BigQuery ---------------------------------------------------------------

# Run query jobs. jobUser is project-scoped; there is no narrower form.
resource "google_project_iam_member" "bgg_viewer_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.bgg_viewer.email}"
}

# The catalog artifact joins analytics.games_features + analytics.best_player_counts.
resource "google_bigquery_dataset_iam_member" "bgg_viewer_analytics_viewer" {
  dataset_id = google_bigquery_dataset.bgg_analytics.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.bgg_viewer.email}"
}

# ...and predictions.bgg_predictions. The `predictions` dataset is NOT managed by this
# Terraform config (only core/raw/analytics are), so the id is literal. This member
# resource is non-authoritative, so it adds a grant without disturbing existing ones.
resource "google_bigquery_dataset_iam_member" "bgg_viewer_predictions_viewer" {
  dataset_id = "predictions"
  project    = var.project_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.bgg_viewer.email}"
}

# core.users is read on login and WRITTEN on registration, so dataEditor, not
# dataViewer. Dataset-scoped: the viewer must not reach `raw`.
resource "google_bigquery_dataset_iam_member" "bgg_viewer_core_editor" {
  dataset_id = google_bigquery_dataset.bgg_data.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.bgg_viewer.email}"
}

# --- Warehouse read API -----------------------------------------------------
# The run.invoker grant lives in warehouse_api.tf, whose authoritative binding is the
# single source of truth for that service's allow-list. Adding it here would fight it.

# --- Secrets ----------------------------------------------------------------
# Containers only. Versions are created manually with `gcloud secrets versions add`
# so no secret value ever enters git or Terraform state.

resource "google_secret_manager_secret" "bgg_viewer_session_secret" {
  secret_id = "bgg-viewer-session-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
    purpose     = "auth"
  }
}

resource "google_secret_manager_secret" "bgg_viewer_registration_code" {
  secret_id = "bgg-viewer-registration-code"
  project   = var.project_id

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
    purpose     = "auth"
  }
}

resource "google_secret_manager_secret_iam_member" "bgg_viewer_session_secret_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.bgg_viewer_session_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.bgg_viewer.email}"
}

resource "google_secret_manager_secret_iam_member" "bgg_viewer_registration_code_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.bgg_viewer_registration_code.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.bgg_viewer.email}"
}

# --- Deploy-time permission -------------------------------------------------
# The CI identity (bgg-data-warehouse@, via GCP_SA_KEY_BGG_DW) already holds run.admin
# and artifactregistry.writer from iam.tf. It additionally needs serviceAccountUser on
# THIS SA to deploy a service that runs as it — without this, `gcloud run deploy`
# fails with "iam.serviceaccounts.actAs" denied.
resource "google_service_account_iam_member" "bgg_viewer_ci_act_as" {
  service_account_id = google_service_account.bgg_viewer.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.bgg_pipeline.email}"
}
```

- [ ] **Step 2: Add the viewer SA to the warehouse invoker allow-list**

In `terraform/warehouse_api.tf`, replace the `default` of
`warehouse_api_invoker_members` (currently on line 26):

```hcl
  default = [
    "user:phil.henrickson@gmail.com",
    # bgg-viewer's Cloud Run runtime SA. In prod the viewer mints an ID token for
    # ITS OWN identity (src/lib/server/warehouse/token.ts -> mintIdToken), not a
    # user's, so without this every game detail page 403s. See terraform/viewer.tf.
    "serviceAccount:bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com",
  ]
```

Use the literal string, not `google_service_account.bgg_viewer.email`. An interpolated
value inside a `variable` block is invalid HCL — variable defaults must be constants.

- [ ] **Step 3: Output the SA email**

Append to `terraform/outputs.tf`:

```hcl
output "bgg_viewer_service_account" {
  description = "Runtime service account for the bgg-viewer Cloud Run service"
  value       = google_service_account.bgg_viewer.email
}
```

- [ ] **Step 4: Format and validate**

```bash
cd ~/Documents/projects/bgg-data-warehouse/terraform
terraform fmt
terraform init
terraform validate
```

Expected: `Success! The configuration is valid.` Fix any error before continuing.

- [ ] **Step 5: Plan and read the output**

```bash
cd ~/Documents/projects/bgg-data-warehouse/terraform
terraform plan -var="project_id=bgg-data-warehouse" -var="environment=prod"
```

Expected — verify each, do not skim:
- 1 `google_service_account` to add (`bgg-viewer`).
- 4 BigQuery IAM members to add (jobUser, analytics viewer, predictions viewer, core editor).
- 2 secrets + 2 secret IAM members to add.
- 1 `google_service_account_iam_member` to add (CI actAs).
- 1 **change** to `google_cloud_run_v2_service_iam_binding.warehouse_api_invokers`
  showing the SA being appended alongside the existing user.
- **No destroys.** If anything is being destroyed, stop and re-read the diff.

If the `predictions` dataset does not exist in the project, the plan succeeds but the
apply fails with a 404. Confirm it first:
`bq ls --project_id=bgg-data-warehouse | grep predictions`

- [ ] **Step 6: Commit (in the warehouse repo)**

```bash
cd ~/Documents/projects/bgg-data-warehouse
git checkout -b feat/bgg-viewer-iam
git add terraform/viewer.tf terraform/warehouse_api.tf terraform/outputs.tf
git commit -m "feat(terraform): dedicated bgg-viewer SA, IAM, and secret containers

Least-privilege runtime identity for the bgg-viewer Cloud Run service:
BigQuery read on analytics + predictions, read/write on core (registration
writes core.users), and accessor on its two auth secrets.

Adds the SA to warehouse_api_invoker_members — in prod the viewer mints an
ID token for its own service account, so detail pages 403 without it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Open the PR, review the CI plan, merge**

Push and open a PR. `terraform.yml` runs `plan` with `environment=prod` on PRs, so the
CI plan is a faithful preview of the merge. Confirm it matches Step 5, then merge —
the push to `main` triggers `apply`.

- [ ] **Step 8: Verify the apply landed**

```bash
gcloud iam service-accounts describe \
  bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com \
  --project=bgg-data-warehouse

gcloud run services get-iam-policy bgg-warehouse-api \
  --region=us-central1 --project=bgg-data-warehouse
```

Expected: the SA exists, and the IAM policy lists it with `roles/run.invoker`.

---

### Task 2: Populate the secret values

Terraform created empty secret containers. A secret with no version cannot be mounted —
`gcloud run deploy` in Task 4 fails outright. This task is manual and deliberately not
automated: the values must not pass through git or CI logs.

**Files:** none (out-of-band `gcloud` commands).

**Interfaces:**
- Consumes: secret ids `bgg-viewer-session-secret`, `bgg-viewer-registration-code` (Task 1).
- Produces: version `1` of each, so Task 4 can mount `:latest`.

- [ ] **Step 1: Create the session secret**

`SESSION_SECRET` HMAC-signs the session cookie, so it must be long and random. Piping
from `openssl` avoids the value reaching shell history or a file.

```bash
openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add \
  bgg-viewer-session-secret --data-file=- --project=bgg-data-warehouse
```

- [ ] **Step 2: Create the registration code**

This is the phrase shared alongside the link, so it should be memorable rather than
random. Replace `bgg2026` with whatever you intend to hand out.

`printf` without a trailing newline matters: `registerSchema` compares the submitted
string exactly, and a trailing `\n` in the secret would make every valid code fail.

```bash
printf 'bgg2026' | gcloud secrets versions add \
  bgg-viewer-registration-code --data-file=- --project=bgg-data-warehouse
```

- [ ] **Step 3: Verify both have an enabled version**

```bash
gcloud secrets versions list bgg-viewer-session-secret --project=bgg-data-warehouse
gcloud secrets versions list bgg-viewer-registration-code --project=bgg-data-warehouse
```

Expected: one `enabled` version each.

- [ ] **Step 4: Confirm the registration code round-trips with no whitespace**

```bash
gcloud secrets versions access latest \
  --secret=bgg-viewer-registration-code --project=bgg-data-warehouse | xxd | tail -2
```

Expected: the final byte is the last character of the phrase — **not** `0a`. If you see
a trailing `0a`, add a new version with `printf` (not `echo`).

Nothing to commit.

---

### Task 3: Dockerfile and .dockerignore

The image must build reproducibly and serve the adapter-node output. Note this project
has **no `svelte.config.js`** — SvelteKit is configured inline in `vite.config.ts` with
`adapter()` at defaults, so the build lands in `build/` and the entry is
`build/index.js` (the same thing `just start` runs).

The test here is a real container serving real traffic locally.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: `package.json` (`build` script, `engines.node >= 20`), `pnpm-lock.yaml`.
- Produces: an image whose `CMD` serves on `$PORT` (default 3000; Cloud Run sets 8080).

- [ ] **Step 1: Write `.dockerignore`**

Write this first — without it the build context includes `node_modules`, a stale
`build/`, and `.env`, which is both slow and a way to bake secrets into an image.

```
.git
.github
node_modules
build
.svelte-kit
.cache
.env
.env.*
!.env.example
docs
scratch
*.md
.DS_Store
.vscode
.superpowers
```

- [ ] **Step 2: Write the `Dockerfile`**

Two things to know before reading it. `package.json` has **no `packageManager` field**,
so bare `corepack enable` would resolve an arbitrary pnpm version — the version is
pinned explicitly instead (`11.0.9`, matching local `pnpm -v`). And `.npmrc` sets
`engine-strict=true`, so the Node major in the image must satisfy `engines.node >= 20`
or install fails; `node:22-slim` does.

```dockerfile
# syntax=docker/dockerfile:1

# Multi-stage so the runtime image carries no dev dependencies and no source —
# just prod node_modules and the adapter-node output.
#
# SvelteKit config is inline in vite.config.ts (there is no svelte.config.js);
# adapter-node at defaults emits build/ with build/index.js as the entry.
#
# pnpm is pinned rather than `corepack enable`-d bare: package.json has no
# packageManager field, so corepack would otherwise pick a version at whim and the
# build would drift from local. Keep PNPM_VERSION in step with `pnpm -v`.

FROM node:22-slim AS deps
WORKDIR /app
ENV PNPM_VERSION=11.0.9
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
COPY package.json pnpm-lock.yaml .npmrc ./
# Frozen lockfile: the build must fail on a stale lockfile, not silently re-resolve.
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
ENV PNPM_VERSION=11.0.9
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
COPY package.json pnpm-lock.yaml .npmrc ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV PNPM_VERSION=11.0.9
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
ENV NODE_ENV=production
# PORT is what adapter-node reads; Cloud Run overrides it with 8080.
ENV PORT=3000

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=build /app/build ./build

# Run unprivileged. The node image ships a `node` user; nothing here writes to disk
# (the offline catalog cache is dev-only), so a read-only app dir is fine.
USER node

EXPOSE 3000
CMD ["node", "build/index.js"]
```

- [ ] **Step 3: Build the image**

```bash
cd ~/Documents/projects/bgg-viewer
docker build -t bgg-viewer:local .
```

Expected: a successful build. If `pnpm build` fails inside Docker but works locally,
the usual cause is a file excluded by `.dockerignore` that the build needs — check
before loosening the ignore file wholesale.

- [ ] **Step 4: Run the container and confirm it serves the login gate**

This is the real test of the task: does the production build boot and gate access?
No GCP credentials are passed, so the catalog will fail to load — that is expected and
not what we are checking. We are checking that an anonymous request is redirected to
login, which also proves `DEV_AUTH_EMAIL` cannot apply in a prod build.

```bash
docker run --rm -p 8080:8080 -e PORT=8080 \
  -e SESSION_SECRET=localtest-not-a-real-secret \
  --name bgg-viewer-test bgg-viewer:local
```

In another terminal:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8080/
```

Expected: `303 http://localhost:8080/login` (or a `200` on `/login` if the app renders
it directly). A `200` on `/` with catalog content would mean the login gate is not
engaged — stop and investigate before deploying anything public.

Then stop it: `docker stop bgg-viewer-test`

- [ ] **Step 5: Confirm the dev-only flags are inert in the image**

`DEV_AUTH_EMAIL` fabricates a logged-in user and `OFFLINE` serves a stale catalog.
Both are guarded by SvelteKit's `dev` constant (`src/hooks.server.ts:19`,
`src/lib/server/offline.ts:19`), which is compile-time `false` in a production build.
Prove it rather than trusting it — this is the one check that protects a public URL:

```bash
docker run --rm -p 8080:8080 -e PORT=8080 \
  -e SESSION_SECRET=localtest-not-a-real-secret \
  -e DEV_AUTH_EMAIL=attacker@example.com \
  -e OFFLINE=1 \
  --name bgg-viewer-test bgg-viewer:local
```

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8080/
```

Expected: still redirected to login — **identical** to Step 4. If setting
`DEV_AUTH_EMAIL` grants access, the deploy must not proceed.

`docker stop bgg-viewer-test`

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/projects/bgg-viewer
git add Dockerfile .dockerignore
git commit -m "feat(deploy): containerize the adapter-node build

Multi-stage image: frozen-lockfile deps, pnpm build, then a slim runtime
carrying only prod node_modules and build/. Runs as the unprivileged node
user and serves \$PORT (8080 on Cloud Run).

Verified locally that a prod build gates anonymous requests to /login even
with DEV_AUTH_EMAIL and OFFLINE set — both are dev-only compile-time guards.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: release-please config and the deploy workflow

Versioned rollout: release-please maintains a release PR from conventional commits;
merging it cuts a semver release, and only then does a deploy happen. Ordinary pushes
to `main` build nothing.

Blue/green: the currently-serving revision is tagged `stable` **before** the new
revision goes out, which is what makes Task 5's rollback possible. Get the order wrong
and rollback returns to the broken revision.

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`

**Interfaces:**
- Consumes: `bgg-viewer@...` SA and both secrets (Task 1); secret versions (Task 2);
  `Dockerfile` (Task 3); existing repo secret `GCP_SA_KEY_BGG_DW`.
- Produces: a Cloud Run service `bgg-viewer` in `us-central1` with a `stable`-tagged
  revision, which Task 5 flips traffic to.

- [ ] **Step 1: Write `release-please-config.json`**

`release-type: node` reads and writes the version in `package.json`. `.` is the
single root package.

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": true
    }
  }
}
```

`bump-minor-pre-major` + `bump-patch-for-minor-pre-major` keep a pre-1.0 project from
jumping to 1.0.0 on the first `feat!`, matching the aebs config.

- [ ] **Step 2: Write `.release-please-manifest.json`**

Seed with the current `package.json` version (`0.0.1`) so release-please's first PR
bumps from where the repo actually is.

```json
{
  ".": "0.0.1"
}
```

- [ ] **Step 3: Write `.github/workflows/release-please.yml`**

```yaml
name: release-please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

env:
  GCP_PROJECT_ID: bgg-data-warehouse
  GCP_REGION: us-central1
  REGISTRY: gcr.io
  SERVICE: bgg-viewer

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      version: ${{ steps.release.outputs.version }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  # Only a merged release PR deploys. Ordinary pushes to main build nothing.
  deploy:
    name: Deploy to Cloud Run
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_BGG_DW }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker --quiet

      - name: Build and push image
        run: |
          VERSION="${{ needs.release-please.outputs.version }}"
          IMAGE="${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.SERVICE }}"
          docker build --tag "${IMAGE}:${VERSION}" --tag "${IMAGE}:latest" .
          docker push "${IMAGE}:${VERSION}"
          docker push "${IMAGE}:latest"

      # Tag the OUTGOING revision `stable` before deploying, so rollback.yml has a
      # known-good target. Guarded because the very first release has no revision yet.
      - name: Tag current revision as stable
        run: |
          CURRENT=$(gcloud run services describe "${{ env.SERVICE }}" \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}" \
            --format='value(status.traffic[0].revisionName)' 2>/dev/null || true)

          if [ -n "$CURRENT" ]; then
            echo "Tagging ${CURRENT} as stable"
            gcloud run services update-traffic "${{ env.SERVICE }}" \
              --update-tags stable="${CURRENT}" \
              --region="${{ env.GCP_REGION }}" \
              --project="${{ env.GCP_PROJECT_ID }}"
          else
            echo "No existing revision — first deploy, nothing to tag."
          fi

      # `gcloud run deploy` is create-or-update, so this handles both the first deploy
      # and every subsequent one with no branching.
      - name: Deploy
        run: |
          VERSION="${{ needs.release-please.outputs.version }}"
          IMAGE="${{ env.REGISTRY }}/${{ env.GCP_PROJECT_ID }}/${{ env.SERVICE }}:${VERSION}"

          gcloud run deploy "${{ env.SERVICE }}" \
            --image="${IMAGE}" \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}" \
            --platform=managed \
            --allow-unauthenticated \
            --service-account="bgg-viewer@${{ env.GCP_PROJECT_ID }}.iam.gserviceaccount.com" \
            --memory=2Gi \
            --cpu=1 \
            --max-instances=10 \
            --port=8080 \
            --set-env-vars="GCP_PROJECT_ID=${{ env.GCP_PROJECT_ID }},WAREHOUSE_API_URL=${{ vars.WAREHOUSE_API_URL }},VERSION=${VERSION}" \
            --set-secrets="SESSION_SECRET=bgg-viewer-session-secret:latest,REGISTRATION_CODE=bgg-viewer-registration-code:latest"

      - name: Show service URL
        run: |
          gcloud run services describe "${{ env.SERVICE }}" \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}" \
            --format='value(status.uri)'
```

`--allow-unauthenticated` is intentional: access is gated by the app's own login, as
with bgg-dash-viewer. `2Gi` matches dash-viewer — the catalog artifact is held in
memory.

- [ ] **Step 4: Set the `WAREHOUSE_API_URL` repo variable**

The workflow reads `vars.WAREHOUSE_API_URL`. It is the warehouse service URL and also
the ID-token audience, so a wrong value produces confusing 401/403s rather than a
connection error.

```bash
gcloud run services describe bgg-warehouse-api \
  --region=us-central1 --project=bgg-data-warehouse --format='value(status.uri)'
```

Set it as a repository *variable* (not a secret — it is not sensitive and secrets are
masked in logs, which makes debugging harder):

```bash
cd ~/Documents/projects/bgg-viewer
gh variable set WAREHOUSE_API_URL --body '<the URL from above>'
```

- [ ] **Step 5: Confirm the deploy credential exists**

```bash
cd ~/Documents/projects/bgg-viewer
gh secret list
```

Expected: `GCP_SA_KEY_BGG_DW`. If absent, copy it from the bgg-data-warehouse repo's
secrets (the same CI identity, which Task 1 granted `serviceAccountUser` on the viewer
SA). It cannot be read back out of GitHub — retrieve it from wherever the key is kept,
or mint a new key for `bgg-data-warehouse@`.

- [ ] **Step 6: Validate the workflow YAML**

```bash
cd ~/Documents/projects/bgg-viewer
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release-please.yml')); print('valid')"
```

Expected: `valid`.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/projects/bgg-viewer
git add release-please-config.json .release-please-manifest.json .github/workflows/release-please.yml
git commit -m "feat(ci): release-please with blue/green Cloud Run deploy

Merging a release PR cuts a semver version and deploys that tag; ordinary
pushes to main build nothing. The outgoing revision is tagged stable before
the new one ships, so rollback is a traffic flip.

Auth secrets come from Secret Manager via --set-secrets rather than plaintext
env vars, since SESSION_SECRET signs session cookies.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rollback workflow

A rollback path that has never been run is not a safety net. This task adds it and
Task 6 exercises it deliberately.

**Files:**
- Create: `.github/workflows/rollback.yml`

**Interfaces:**
- Consumes: the `stable` revision tag maintained by Task 4's deploy job.
- Produces: 100% of traffic on the `stable` revision.

- [ ] **Step 1: Write `.github/workflows/rollback.yml`**

```yaml
name: rollback

# Manual only. Rollback is a human decision, never automatic.
on:
  workflow_dispatch:

env:
  GCP_PROJECT_ID: bgg-data-warehouse
  GCP_REGION: us-central1
  SERVICE: bgg-viewer

jobs:
  rollback:
    name: Roll back to stable
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_BGG_DW }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Show current traffic
        run: |
          echo "Traffic before rollback:"
          gcloud run services describe "${{ env.SERVICE }}" \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}" \
            --format='yaml(status.traffic)'

      # `stable` points at whatever was serving before the last release deployed.
      - name: Shift traffic to stable
        run: |
          gcloud run services update-traffic "${{ env.SERVICE }}" \
            --to-tags stable=100 \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}"

      - name: Verify
        run: |
          URL=$(gcloud run services describe "${{ env.SERVICE }}" \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}" \
            --format='value(status.uri)')
          echo "Service URL: ${URL}"
          echo "Traffic after rollback:"
          gcloud run services describe "${{ env.SERVICE }}" \
            --region="${{ env.GCP_REGION }}" \
            --project="${{ env.GCP_PROJECT_ID }}" \
            --format='yaml(status.traffic)'
```

- [ ] **Step 2: Validate the YAML**

```bash
cd ~/Documents/projects/bgg-viewer
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/rollback.yml')); print('valid')"
```

Expected: `valid`.

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/projects/bgg-viewer
git add .github/workflows/rollback.yml
git commit -m "feat(ci): manual rollback to the stable revision

workflow_dispatch only — flips 100% of traffic to the stable-tagged revision
and prints the allocation before and after.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: First deploy, end-to-end verification, and rehearsed rollback

Everything so far is unproven until a release actually ships. This task ships it and
checks the things that can realistically be broken: the login gate, the catalog
(BigQuery IAM), and detail pages (the warehouse invoker grant).

**Files:**
- Modify: `README.md` (add a Deployment section)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a live public URL, and a verified rollback path.

- [ ] **Step 1: Confirm Task 1 is applied before deploying**

The invoker grant must be live or detail pages 403. If Task 1's PR is not merged and
applied, stop here.

```bash
gcloud run services get-iam-policy bgg-warehouse-api \
  --region=us-central1 --project=bgg-data-warehouse \
  | grep -A3 "run.invoker"
```

Expected: `serviceAccount:bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com` present.

- [ ] **Step 2: Merge the branch to main**

Push the branch holding Tasks 3–5 and merge it. On merge, `release-please.yml` runs and
opens a release PR. The `deploy` job is skipped — `release_created` is not `true` yet.
That skip is correct, not a failure.

- [ ] **Step 3: Merge the release PR**

Find the "chore(main): release ..." PR release-please opened, confirm the version bump
and CHANGELOG look right, and merge it. This sets `release_created=true` and triggers
the deploy job.

- [ ] **Step 4: Watch the deploy**

```bash
cd ~/Documents/projects/bgg-viewer
gh run watch
```

Expected: `release-please` then `deploy` succeed, and the final step prints the service
URL. If the deploy fails on `iam.serviceaccounts.actAs`, the `serviceAccountUser` grant
from Task 1 Step 1 did not apply.

- [ ] **Step 5: Verify the login gate on the public URL**

```bash
URL=$(gcloud run services describe bgg-viewer --region=us-central1 \
  --project=bgg-data-warehouse --format='value(status.uri)')
echo "$URL"
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$URL/"
```

Expected: a redirect to `/login`. **An anonymous `200` with catalog content on a public
URL is a security failure — roll back immediately (Task 5) and investigate.**

- [ ] **Step 6: Register, and verify the catalog and a detail page in a browser**

Open the URL, register with the code from Task 2 Step 2, and check:
1. Registration succeeds — proves `REGISTRATION_CODE` is mounted correctly and
   `core.users` is writable (dataEditor on `core`).
2. The catalog/discover page lists games — proves BigQuery read on `analytics` and
   `predictions`. "Catalog failed to load" means a missing dataset grant; the first
   load runs a ~40 MB scan and may take a few seconds.
3. A game detail page renders description and box art — proves the warehouse invoker
   grant. A failure here specifically means Task 1 Step 2 did not take effect.

- [ ] **Step 7: Rehearse the rollback**

Do this now, while nothing is wrong, so the path is known-good before it is needed. A
first deploy has no `stable` tag yet (nothing was serving), so this requires a second
release to have shipped. Either wait for your next real release, or make a trivial
`fix:` commit, merge its release PR, then:

```bash
cd ~/Documents/projects/bgg-viewer
gh workflow run rollback.yml
gh run watch
```

Expected: the "before" and "after" traffic blocks differ, with 100% on the `stable`
revision afterwards. Confirm the site still loads, then ship forward again with a
normal release.

If `--to-tags stable=100` errors with an unknown tag, no `stable` tag exists yet —
that is the first-release case above, not a bug.

- [ ] **Step 8: Document deployment in the README**

Add before the closing sections, replacing `<service-url>` with the real URL:

```markdown
## Deployment

Deployed to Cloud Run in `bgg-data-warehouse` (`us-central1`) at `<service-url>`.
The URL is public; access is gated by the app's own login, and registration requires
the shared code (Secret Manager: `bgg-viewer-registration-code`).

**Releasing.** Commits to `main` use conventional-commit prefixes, and
[release-please](https://github.com/googleapis/release-please) keeps a release PR open
with the pending version bump and changelog. **Merging that PR is what deploys** — an
ordinary push to `main` builds nothing. The deploy tags the outgoing revision `stable`
before shipping the new one.

**Rolling back.** Run the `rollback` workflow (`gh workflow run rollback.yml`). It
shifts all traffic to the `stable` revision — the one serving before the most recent
release — and prints the traffic allocation before and after.

**Infrastructure.** The runtime service account, its BigQuery and Secret Manager IAM,
and its `run.invoker` grant on the warehouse API all live in Terraform in
[bgg-data-warehouse](https://github.com/phenrickson/bgg-data-warehouse)
(`terraform/viewer.tf`), applied by that repo's `terraform.yml`. Cloud Run itself is
deployed from here. Secret *values* are set manually with `gcloud secrets versions add`
and never pass through Terraform or CI.
```

- [ ] **Step 9: Commit**

```bash
cd ~/Documents/projects/bgg-viewer
git add README.md
git commit -m "docs: how bgg-viewer is deployed, released, and rolled back

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verification checklist

- [ ] `bgg-viewer@` SA exists; `terraform plan` is clean (no pending diff, no destroys).
- [ ] The SA holds `run.invoker` on `bgg-warehouse-api`.
- [ ] Both secrets have an enabled version; the registration code has no trailing newline.
- [ ] `docker build` succeeds and the container serves locally.
- [ ] A prod build redirects anonymous requests to `/login` **even with `DEV_AUTH_EMAIL` set**.
- [ ] A push to `main` that is not a release merge deploys nothing.
- [ ] Merging a release PR builds a semver-tagged image and deploys it.
- [ ] Registration works with the shared code; the catalog loads; a detail page renders.
- [ ] `rollback.yml` has been run at least once and moved traffic to `stable`.
- [ ] README documents the URL, the release flow, and the rollback command.

## Out of scope

Custom domain; dev/staging service; `min-instances` warm-start; monitoring and
alerting; migrating users off bgg-dash-viewer (both run side by side); any change to
the login/registration flow; migrating CI from SA keys to workload identity federation
(worth doing across both repos as its own piece of work — see the deviation note above).
