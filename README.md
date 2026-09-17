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
gcloud auth application-default login   # ADC: BigQuery + GCS reads from the server
gcloud auth login                       # identity tokens for the gated warehouse API
```

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

A note on the catalog: in production it's a CI-built artifact served from a private GCS
bucket via signed URL. Signing needs a service-account key that user ADC doesn't have, so
locally the server logs `[catalog] GCS path failed, falling back to BigQuery build` and
builds it from BigQuery instead (one ~40 MB scan, then cached in-process for 6 hours). That
log line is expected. Set `CATALOG_SOURCE=bigquery` to skip the attempt and silence it.

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
