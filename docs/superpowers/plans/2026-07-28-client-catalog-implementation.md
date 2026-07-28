# BGG Viewer — Client-Side Catalog — Implementation Plan

> **Flow:** implement step-by-step; **stop after each PR for review.** TDD where
> logic is unit-testable (artifact build, catalog query API); front-end verify
> (`just check` + dev server + light/dark) for pages. Follows the copied
> `frontend-patterns` / `style-rules` skills.

**Spec:** [specs/2026-07-28-client-catalog-architecture-design.md](../specs/2026-07-28-client-catalog-architecture-design.md)

**Goal:** A logged-in user opens `/games` (Explore), and filtering / sorting /
searching / charting the ~38k working set is **instant and client-side** (DuckDB-WASM
over a cached artifact), with the **server scaling to zero**. Detail pages already
work; this adds the multi-game workspace.

## Delivery

- Each step below is one **branch → PR → `main`** (GitHub remote now exists),
  reviewed before the next starts. Never develop on `main`.
- **Step 0 (spike) is a gate** — if its numbers are bad, we revisit the spec before
  building on it.

## Dependency note

The whole plan is **viewer-repo only** and testable **locally** end-to-end. The
`pipeline → GCS` artifact build (spec's later optimization) and deploy/IAM (the SK
server's BigQuery-read grant) are **out of scope here** — the server materializes the
artifact from BigQuery via ADC, which works locally today.

---

## Step 0 — Spike: prove DuckDB-WASM (GATE)

**Branch:** `spike/duckdb-wasm` (throwaway — merged as a documented spike or discarded)

**Affected:** a scratch `/(app)/spike` route; a locally-generated artifact file.

- [ ] **Generate** a real artifact of the ~38k working set locally (BigQuery →
  Parquet **and** Arrow IPC — we compare) and record each file's size, raw + gzipped.
- [ ] **Load in-browser:** minimal `/spike` route that loads DuckDB-WASM (client-only —
  confirm it initializes under SvelteKit/Vite with its worker + wasm), registers the
  artifact, and runs: a `COUNT(*)`, a filtered `WHERE`, and a `GROUP BY` histogram.
- [ ] **Measure** in the browser and log: artifact download size, DuckDB init time,
  artifact register/load time, and each query's wall time.
- **Verify (the gate):** payload ≤ ~5 MB gzipped; cold load (init + register) ≤ ~2s;
  filter/group-by **< 100ms**. Decide **Parquet vs Arrow IPC** as the artifact format
  from the measured sizes/times. If the gate fails, stop and revise the spec.

---

## Step 1 — Catalog artifact: server materialize + cache + serve

**Branch:** `feat/catalog-artifact`

**Affected:** `src/lib/server/catalog/` (query + serialize + cache), a server route or
remote function to serve the artifact, `src/lib/server/bq` (reuse the existing
BigQuery client wiring).

- [ ] **Query** the working set (`users_rated >= 25 OR year_published >= <current>`)
  from `analytics.games_features`, narrow columns, via `@google-cloud/bigquery`.
- [ ] **Serialize** to the format chosen in Step 0; **cache** in module memory with a
  `version` (date/hash); rebuild on a TTL (config) — atomic swap, no restart.
- [ ] **Serve** it from an **authed** route (behind the `(app)` guard), with the
  version in an ETag/URL so the browser caches and re-fetches only on change.
- **Verify (TDD for the query/serialize/cache logic):** unit tests for column set,
  cache reuse, version change → rebuild; then hit the route locally — correct row
  count, second hit served from cache, `just check` + tests green.

---

## Step 2 — Client catalog: DuckDB-WASM store + loader

**Branch:** `feat/catalog-client`

**Affected:** `src/lib/catalog/` — a catalog store: init DuckDB-WASM, fetch + register
the artifact, expose `query(sql)` / typed helpers; a loading state.

- [ ] **Load once** on first Explore visit: fetch the artifact from Step 1, register in
  DuckDB-WASM, expose an async `query()` and a ready/loading state.
- [ ] **Version-aware cache** in the browser (IndexedDB/Cache API) so a return visit
  skips re-download unless the version changed.
- **Verify:** a dev harness runs `query()` and renders a row count + a sample
  aggregate; loading state shows on cold load; `just check` green.

---

## Step 3 — Explore shell: rail (scope) + canvas + URL state

**Branch:** `feat/explore-shell`

**Affected:** `src/routes/(app)/games/+page.svelte` (+ colocated rail/canvas),
`src/lib/catalog/scope.ts` (filter state ⇄ URL ⇄ SQL WHERE).

- [ ] **Filter rail** per the mockup: ranges (year/complexity/geek), best-at,
  category/mechanic facets. State lives in the **URL** (shareable, reload-safe).
- [ ] **Scope → SQL:** compile the rail state into a `WHERE` clause; the canvas header
  shows the live count + scope summary.
- **Verify:** changing a filter updates the result count instantly; the URL reflects
  scope; reload restores it; light + dark checked.

---

## Step 4 — Explore views: Overview (charts) + Table

**Branch:** `feat/explore-views`

**Affected:** view-module components; deps `layerchart` + `d3-scale` (charts) and
`@tanstack/table-core` + the `data-table` component set (copied from the kit).

- [ ] **Overview:** stat tiles + LayerChart panels over the scoped set — rating
  distribution, complexity-vs-rating scatter, games-per-year, top categories — colors
  from `--chart-N` per `style-rules`. Client-side aggregates via DuckDB.
- [ ] **Table:** TanStack DataTable (Pattern A) of the scoped set; row → `/games/{id}`.
- [ ] **View switcher** (Overview / Table) in the canvas header.
- **Verify:** charts + table render over the filtered set and update on filter change
  (< 100ms); `just check` green; light + dark checked; a real slice (e.g. "2025,
  complexity > 3") looks right.

---

## Step 5 — Search: client-side game picker in the nav

**Branch:** `feat/catalog-search`

**Affected:** a header search component; a catalog `search(name)` helper.

- [ ] **Search box** in the shell header: `WHERE name LIKE` over the catalog (DuckDB),
  popularity-ranked, dropdown of matches → navigate to `/games/{id}`.
- **Verify:** typing surfaces matches instantly; selecting navigates; no server call.

---

## Risks / unknowns / rollback

- **DuckDB-WASM ↔ SvelteKit/Vite integration** (worker + wasm assets, client-only, no
  SSR) is the main integration risk — **Step 0 exists to de-risk exactly this.**
- **Artifact format** (Parquet vs Arrow IPC): decided by Step 0's measured
  size/load; Node-side Parquet writing is fiddlier than Arrow IPC — a factor.
- **Deploy-time only (out of scope now):** the SK server's service account needs
  BigQuery read on `analytics`; local ADC covers dev. Note for the later deploy slice.
- **BigQuery cost:** the materialize query is ~30 MB, run at most on a TTL — negligible.
- Each step is an independent PR and revertable; nothing here is a one-way door.

## Out of scope

- `pipeline → GCS` artifact build (spec's later optimization); deploy/IAM.
- Live modules (similarity / prediction / simulation) and entity pages — each its own
  slice on top of this foundation.
- Kitchen-sink (140k) views — the 38k working set only.
