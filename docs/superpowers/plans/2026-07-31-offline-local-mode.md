# Offline local mode — implementation plan

**Spec:** [2026-07-31-offline-local-mode-design.md](../specs/2026-07-31-offline-local-mode-design.md)
**Branch:** `feat/offline-local`
**Status:** pending approval

## Goal

With offline mode on and a previously-warmed catalog, `just dev` on a laptop with no
network serves a working app: landing and Explore fully functional, and a game profile
rendering catalog data with warehouse-only sections absent.

**Success criteria.** Network disabled, offline flag set, `just dev` from cold:
`/` warms the catalog from disk; `/games` filters and charts normally; clicking a game
renders a profile (stats, facets, predictions) instead of an error page.

## Affected surfaces

- `src/lib/server/catalog/cache.ts` — write-through to disk; serve from disk when offline
- `src/routes/api/catalog/+server.ts` — likely unchanged if the cache owns the fallback
- `src/routes/(app)/games/[id]/+page.server.ts` — skip the warehouse when offline
- `src/routes/(app)/games/[id]/+page.svelte` — catalog-backed path + offline disclosure
- `src/lib/catalog/catalog.svelte.ts` — a single-game query helper (reuses `query()`)
- `.gitignore` — the cache file
- `justfile` / `.env.example` — how the flag is set, documented
- Tests: `cache.test.ts` (exists, has an injectable builder seam); new coverage for the
  catalog→view-model mapper
- **Not** `columns.ts` — no artifact shape change

## Steps

Each step is an independent PR, smallest-safe-change first. Step 2 depends on Step 1 only
for end-to-end testing, not for code.

### Step 1 — Persist the catalog artifact to disk

Write the built blob to a gitignored path after a successful build, preserving `version`
and `builtAt`. When the offline flag is set, read that file instead of calling BigQuery.
If the flag is set and no file exists, fail with a message that says so plainly — that is
a real error, not something to paper over.

*Verification:* unit tests through the existing injectable `builder`/`clock` seams — writes
on success, serves the file when offline, clear error when offline with no cache. Then
live: warm it online, set the flag, restart, confirm `/games` still loads and BigQuery is
never called.

### Step 2 — Catalog-backed game profile when offline

Server `load` stops calling the warehouse when the flag is set, and hands the browser a
signal instead of throwing. The page queries DuckDB for that `game_id` and maps the row
into the shape `+page.svelte` already consumes. Warehouse-only fields stay absent — the
page's existing `{#if}` guards handle them.

*Verification:* `just check`; a unit test on the catalog→view-model mapper (pure function,
no DuckDB needed); live with the flag set — profile renders, missing sections gone, no
error page. Both light and dark.

### Step 3 — Disclose offline state and catalog age

A flagged placeholder line indicating the page is offline and how old the cached catalog
is (`builtAt` is already on the artifact). Phil writes the final copy.

*Verification:* visual, both themes.

## Risks / unknowns / rollback

- **Flag mechanism** — env var vs. `just` recipe pair. Env var is simpler; either way it
  must be readable server-side *and* reach the client, since both paths branch on it.
- **The `load` signal shape** — returning `{ game: null, offline: true }` means every
  consumer of `data.game` must tolerate null. The page currently does `$derived(data.game)`
  and dereferences freely, so this needs care.
- **Staleness is invisible without Step 3.** An offline catalog from three weeks ago looks
  identical to a fresh one. Step 3 is what keeps it honest.
- **Rollback:** every step is additive and gated on a flag that defaults off. Revert the PR.
- **No one-way doors** — no artifact or column changes, so no ETag churn and no
  client/BigQuery drift.

## Out of scope

- Caching warehouse documents so visited games render fully offline
- Production cold-start caching (Cloud Run filesystem is a different problem)
- Service worker / PWA offline shell
- Making the catalog the profile's primary source in production
