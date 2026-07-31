# Offline local mode — design

**Status:** draft, pending approval
**Date:** 2026-07-31
**Branch:** `feat/offline-local`

## Why

The use case is personal and specific: a long international flight, no network, and a
working copy of this app on a laptop. Today that fails at the first step — the catalog is
materialized from BigQuery on demand, so a cold `just dev` with no connectivity has
nothing to serve, and every game profile is a live warehouse call.

This is **not** a deployed feature for other people, and not graceful degradation for a
flaky production network. It is a mode the developer turns on deliberately, on their own
machine, knowing they are about to lose connectivity.

Framing that matters: **the laptop is the server.** `just dev` runs the SvelteKit server
locally, so "server-side" persistence means a file on the same machine as the browser.

## What "offline" costs

The catalog artifact already carries most of what a game profile shows. Comparing the
artifact columns (`src/lib/server/catalog/columns.ts`) against what the detail page reads:

**Available offline** — name, year, geek/average rating, average weight, users_rated,
min/max players, all six facet lists (categories, mechanics, families, designers, artists,
publishers), all five predictions plus `sample_status` and `training_cutoff_year`, and the
best/recommended player-count arrays.

**Warehouse-only, absent offline** — description, image/thumbnail, min/max playtime,
min_age, `num_weights`, `last_updated`, per-player-count vote totals and percentages,
`similar`, and per-target model names/versions.

So an offline profile keeps the hero stats, the facets, and the prediction panel. It loses
box art, description, similarity, and the vote-weighted player-count detail. That is a
usable profile, not a stub — which is what makes this worth building.

Fortunate finding: `+page.svelte` is already defensive. `image`, `minAge`, `description`,
`weightVotes`, `playerCounts`, the facet lists, `similar` (explicit empty state), and the
models block are all `{#if}`-guarded. Missing warehouse fields largely just don't render,
so the UI work is small.

## Approach

**One global flag, not per-request failure detection.** Offline is a mode you switch on,
not a timeout you recover from. This is easier to reason about and easier to test — you
flip a variable rather than unplugging a cable. It also matches the real use case: you
know you're boarding a plane.

Two independent paths read that flag, mirroring the two data paths this app already keeps
separate:

1. **Catalog (cold start).** The browser has nothing after a restart, so `/api/catalog`
   must serve something. On a successful build the artifact is written to a gitignored
   file; in offline mode the endpoint serves that file and never touches BigQuery. One
   read at warm-up.

2. **Game profile (per click).** The browser already holds the catalog in DuckDB-WASM —
   that is how Explore works, and it is how you got to the game you clicked. Offline, the
   profile is a `SELECT ... WHERE game_id = ?` against that in-memory database.

### Rejected: reading the disk artifact to answer a game click

An earlier draft had the server read the cached Arrow file and pull one row for the
profile. This is wrong. The browser has already parsed and indexed that data; re-parsing
~40 MB server-side to answer a question DuckDB can answer instantly is pure waste. The
disk cache exists **only** for the cold-start case, where the browser genuinely has
nothing.

### Rejected: browser-side persistence (IndexedDB)

Viable, but pointless here. The process serving the page has a filesystem on the same
machine. Involving browser storage adds a second cache and a second staleness story for
no gain.

### Rejected: making the catalog the profile's primary source everywhere

The bigger redesign — always render from the catalog, treat the warehouse as purely
additive. It has real merit (faster first paint in production too) but it changes
production behavior, and this feature does not need it. Noted as a possible future
direction; the offline fallback is a stepping stone rather than wasted work, since it
forces the same split between catalog-derived and warehouse-only fields.

## Scope

**In:** a dev-only offline flag; disk persistence of the catalog artifact; a catalog-backed
profile path; a placeholder line disclosing offline state and catalog age.

**Out:** caching warehouse documents for visited games; any production cold-start
optimization; service worker / PWA; changes to the Arrow artifact shape or `columns.ts`
(no ETag churn, no one-way doors).

## Open questions

- Flag mechanism — env var (`OFFLINE=1`) is the obvious choice, but a `just` recipe pair
  (`just offline` / `just online`) may be friendlier. Env var is simpler; decide at
  implementation.
- The profile's client path needs the server `load` to stop throwing on warehouse failure
  and instead hand the browser a signal (`{ game: null, offline: true }` or similar). Exact
  shape to be settled in Step 2.
- Copy is Phil's. Placeholders only, clearly flagged.
