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
| [gcloud](https://cloud.google.com/sdk/docs/install) | any | BigQuery access — see step 3 | `brew install --cask google-cloud-sdk` | `winget install Google.CloudSDK` |

Already have these, or manage Node with mise/fnm/nvm? Use what you have — nothing here
pins a version. Run `just doctor` after step 2 to confirm what you ended up with.

### 2. Clone and install

```sh
git clone https://github.com/phenrickson/bgg-viewer.git
cd bgg-viewer
just setup          # pnpm install
just doctor         # print toolchain versions
```

### 3. Configure the environment

```sh
cp .env.example .env
```

`.env` is gitignored. The minimum for a browsable local app:

```sh
# Skips the app's login screen (dev builds only). Any email works — no account needed.
DEV_AUTH_EMAIL=you@example.com
GCP_PROJECT_ID=bgg-data-warehouse
```

There are two separate credential layers, and `DEV_AUTH_EMAIL` only removes the first:

| | Needed with `DEV_AUTH_EMAIL`? |
| --- | --- |
| **App account** — a row in `core.users`, plus `SESSION_SECRET` + `REGISTRATION_CODE` | No. A session user is fabricated in-memory; `core.users` is never read. |
| **GCP credentials** — ADC for BigQuery | **Yes, always.** The catalog is read from BigQuery regardless of how you signed in. |

So you still need Google Cloud access via
[Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc):

```sh
gcloud auth application-default login
```

The catalog artifact joins three tables, so you need read on all of them:

- `analytics.games_features`
- `analytics.best_player_counts`
- `predictions.bgg_predictions`

Without access the app still boots and renders — the catalog request (`/api/catalog`)
fails and the page shows "Catalog failed to load". First load runs one ~40 MB BigQuery
scan, then caches in-process for 6 hours. `just doctor` checks this before you start.

To exercise the real login/register flow instead, unset `DEV_AUTH_EMAIL` and set
`SESSION_SECRET` (any long random string) and `REGISTRATION_CODE` — that path reads and
writes `core.users` in the same BigQuery project, so it needs the same ADC. Game detail
pages that proxy the warehouse read API additionally need `WAREHOUSE_API_URL`. See
[.env.example](.env.example) for the full annotated list.

### 4. Run it

```sh
just dev        # dev server on http://localhost:5173 (auto-opens)
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
