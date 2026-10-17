# bgg-viewer

A SvelteKit front-end for BGG data — flexible catalog browse/search plus model
enrichments (predictions, similarity, embeddings). Consumes the decoupled
warehouse read API in `bgg-data-warehouse`. Eventually replaces `bgg-dash-viewer`.

Built from the conventions in the `front-end-design` starter kit (copied into
`.claude/skills/` and owned here). Stack: SvelteKit 2 (SSR, adapter-node),
Tailwind v4 + OKLCH tokens, Svelte 5 runes, TanStack, LayerChart.

## Getting started

### 1. Prerequisites

| Tool | Version | Purpose | macOS | Windows |
| --- | --- | --- | --- | --- |
| [Node](https://nodejs.org) | ≥ 20 | runtime (enforced by `engines` on install) | `brew install node` | `winget install OpenJS.NodeJS` |
| [pnpm](https://pnpm.io/installation) | ≥ 10 | package manager | `brew install pnpm` | `winget install pnpm.pnpm` |
| [just](https://github.com/casey/just#installation) | ≥ 1.4 | task runner | `brew install just` | `winget install Casey.Just` |
| [gcloud](https://cloud.google.com/sdk/docs/install) | any | GCP credentials — see step 3 | `brew install --cask google-cloud-sdk` | `winget install Google.CloudSDK` |

Already have these, or manage Node with mise/fnm/nvm? Use what you have — nothing here
pins a version.

### 2. Clone and install

```sh
git clone https://github.com/phenrickson/bgg-viewer.git
cd bgg-viewer
just setup          # pnpm install + creates .env from .env.example (generates SESSION_SECRET)
```

`just setup` never overwrites an existing `.env`; re-running it only fills blank keys.

### 3. Credentials

There are **two independent credential layers**. Most confusion on a new machine comes from
satisfying one and assuming the other is covered.

| Layer | What it gates | How to satisfy it locally |
| --- | --- | --- |
| **App login** | The app's own login screen and `core.users` | Set `DEV_AUTH_EMAIL` in `.env` — any email, no account needed. |
| **GCP access** | Everything the *server* reads: BigQuery, GCS, the warehouse API | `gcloud` — not `.env`. Always required, even with `DEV_AUTH_EMAIL`. |

**App login.** Open `.env` and set:

```sh
DEV_AUTH_EMAIL=you@example.com
```

That fabricates a session in memory (dev builds only). To exercise the real
login/register flow instead, leave it unset — `SESSION_SECRET` is already generated, and
you'll need `REGISTRATION_CODE` (ask Phil) to create an account in `core.users`.

**GCP access.** Your Google account needs to be granted access to the `bgg-data-warehouse`
project (ask Phil), then log in twice — the two commands produce different credentials:

```sh
# ADC: BigQuery + GCS from the server, as the app's own service account
gcloud auth application-default login \
  --impersonate-service-account=bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com

gcloud auth login   # your own account: identity tokens for the gated warehouse API
```

Impersonation is deliberate, not optional polish. The catalog, thumbnails and coordinates
are CI-built artifacts the *browser* downloads from a private bucket via a signed URL, and
only a service account can sign one — plain user ADC can read GCS but cannot sign. It also
means local dev runs with exactly the permissions production has. The impersonation needs
**Service Account Token Creator** for your account on that service account (ask Phil).

What each part of the app needs:

| Feature | Needs |
| --- | --- |
| Catalog / Explore pages | BigQuery read on `analytics.games_features`, `analytics.best_player_counts`, `predictions.bgg_predictions` |
| Real login, "My collection" | BigQuery read/write on `core.users`, read on `collections.user_collections` |
| Game detail pages | `WAREHOUSE_API_URL` in `.env` + `run.invoker` on that Cloud Run service |
| Linking a BGG collection | `COLLECTION_SYNC_SERVICE_URL` in `.env` + `run.invoker` on that service |

Each layer degrades independently: without the warehouse API the catalog still browses and
game pages fail; without BigQuery the app boots and `/api/catalog` returns
"Catalog failed to load". Check where you stand before starting:

```sh
just doctor         # toolchain versions, .env keys, and a dry-run against each BigQuery table
```

**If GCS isn't working**, two things to check, in this order:

1. **`[catalog] GCS path failed, falling back to BigQuery build`** (or `[thumbnails]`,
   `[coordinates]`) in the server log means signing failed — almost always ADC set up
   without `--impersonate-service-account`. The app still works: each artifact is rebuilt
   from BigQuery and cached in-process, at the cost of a slow first load. Re-run the ADC
   login above to fix it. `CATALOG_SOURCE=bigquery` skips the catalog's GCS attempt
   entirely if you want the fallback on purpose.
2. **The catalog "fails to load" but the server log is clean** and `/api/catalog` returns
   200: the browser's fetch to `storage.googleapis.com` was blocked by CORS. The bucket's
   allow-list names `http://localhost:5173` only, so the dev server must run on 5173 —
   `just dev` does. Check the browser console, not the server.

**No GCP access at all?** If someone gives you a `.cache/catalog.arrow.gz` from a machine that
has run online, `just dev-offline` serves the catalog from it with no network; game detail
enrichments are unavailable. See [.env.example](.env.example) for every variable, annotated.

### 4. Run it

```sh
just dev        # dev server on http://localhost:5173
```

### Everyday commands

```sh
just            # list all recipes
just check      # svelte-check (types)
just test       # vitest unit tests
just build      # production build (adapter-node)
just start      # serve the build (PORT overrides; default 3000)
just verify     # types + tests + build — run before every PR
just clean      # remove .svelte-kit and build
```

## Docs

- Design: [docs/superpowers/specs/](docs/superpowers/specs/)
- Plan: [docs/superpowers/plans/](docs/superpowers/plans/)
