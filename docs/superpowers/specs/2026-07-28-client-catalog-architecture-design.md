# BGG Viewer — Client-Side Catalog Architecture — Design

**Date:** 2026-07-28
**Status:** Draft for review
**Supersedes serving decisions in:** [2026-07-23-viewer-mvp-catalog-and-detail-design.md](2026-07-23-viewer-mvp-catalog-and-detail-design.md)
(the MVP spec assumed a server-side `GET /games` list/facets endpoint; this replaces that with a client-side catalog)

## Goal

Define the **serving + data-orchestration architecture** for a front-end that juggles
many ways of looking at the warehouse — find a game, browse/filter/**visualize** sets
of games, drill into one, pivot by entity, review predictions/similarity — that stays
fast at ~140k games, costs ~$0/month out of pocket, and lets new "ways of looking"
(including live scoring) be added without rebuilding the foundation.

The IA/UX is already settled by the workspace mockup
([docs/design/layout-ia-mockup.html](../../design/layout-ia-mockup.html)): a filter
**rail** (scope) + a **canvas** of swappable **view modules**. This spec is about the
data layer beneath that shell, not the shell itself.

### Success criteria

- Filtering, sorting, paginating, searching, and charting a set of games is
  **instant** (sub-100ms) with **no per-interaction server call or BigQuery cost**.
- The server **scales to zero** — no always-on instance, no monthly floor. Idle cost
  ≈ $0 (Cloud Run free tier).
- A new **view module** — including a **live** one (similarity, prediction scoring,
  simulation) — is added with a component (+ optional endpoint), **without** touching
  the catalog or the shell.
- The catalog stays fresh automatically (daily), with no restart and no user-visible
  staleness beyond the refresh interval.

## Background & the shape of the problem

The capabilities look like one thing but are **four data-access shapes**, each with a
different cost profile:

| Shape | Example | Cost character |
|---|---|---|
| Point lookup | game detail | trivial (1 row) — already built |
| Typeahead search | nav search box | needs sub-second name lookup |
| List + filter + sort + paginate | catalog, entity pages | server-side over 140k; cost hinges on table shape |
| Aggregate / visualize a set | the charts over a set | GROUP-BY/distributions — trickiest, newest |

The unlock: the warehouse updates on a **batch schedule, not live**, so the read side
is **cache-friendly** — performance is bought with *precomputation*, not runtime work.

### The number that decides the architecture

The working population is **small**:

| Population | Definition | Count |
|---|---|---|
| Established | rated ≥25, published ≤ current year | ~33,000 |
| Upcoming / new | published in/after current year, mostly unrated | ~4,700 |
| **Working set** | **established ∪ upcoming** | **~38,000** |
| Kitchen sink | everything | ~140,000 |

The whole ~38k working set, in a **narrow shape** (ids, name, year, ratings, weight,
players, categories/mechanics/families), is **~30 MB to scan — once.** 38k narrow rows
is small enough to hold **entirely in memory**.

## Architecture (the decision)

**The catalog is a client-side dataframe.** Rather than serving list/filter/aggregate
from BigQuery per interaction (pays repeatedly to re-scan an unchanged set) or from
precomputed per-view serving tables (rigid — every new chart is warehouse work), we:

1. **Daily pipeline builds a compact catalog artifact** — the ~38k narrow working set
   as **Parquet** (~2–3 MB), written on the same schedule that refreshes the warehouse.
2. **The browser loads the artifact once per day** (through the authenticated SK
   server, since the data is gated) into **DuckDB-WASM**.
3. **All catalog interaction is client-side SQL** — filter, sort, paginate, aggregate,
   search, chart — sub-100ms over 38k rows, zero server round-trips, zero BQ cost.
4. **The server stays thin & stateless:** auth, serve the (cached) artifact, and
   per-game detail point lookups. Nothing to keep warm → **scales to zero**.

```text
daily pipeline → ~3 MB Parquet catalog artifact
browser        → loads once/day into DuckDB-WASM → client-side SQL, instant
server         → auth + serve-artifact + detail lookups → scales to zero (~$0)
```

### Why client-held, not server-held

Under scale-to-zero, **server memory is ephemeral** — it dies when the instance scales
down, so a server-held set re-pays the load on every cold start. A **browser-held** set
persists for the whole session regardless of server scaling. Scale-to-zero and
client-held are the natural pairing: **the client is the durable cache; the server is
stateless.** DuckDB-WASM gives us full client-side SQL, which matches how this data is
actually reasoned about — a dataframe you query.

### Cost

- **Scale-to-zero → ~$0/month** for personal usage (within Cloud Run's free tier).
- `min-instances ≥ 1` was **rejected**: ~$5–10/mo (CPU throttled) to ~$60/mo (CPU
  always allocated) to hide a ~1–2s cold start — not worth it out of pocket.
- The only cost of scale-to-zero is the **cold-start load**, made cheap by the
  precomputed artifact (see below).

### Startup, freshness, and the loading state

- **Cold start** loads the small artifact in ~1–2s (vs ~7s for a live 38k BQ fetch —
  measured: BQ executes in ~1s, but row transfer dominates), behind a graceful
  **loading state** shown *only* while warming.
- **Detail pages don't depend on the catalog** — they're point lookups straight to the
  warehouse API, so `/games/{id}` works instantly even while the catalog warms.
- **Refresh:** the artifact carries a version/date; the browser re-fetches when it
  changes (daily). No restart, no stale-beyond-a-day.

## The two layers (this is the extensibility contract)

View modules come in two kinds, cleanly separated:

- **Layer 1 — the catalog (client-side):** *which* games + static features/aggregates.
  Modules query the in-browser DuckDB. Free, instant. (rating distribution, complexity
  scatter, category mix, search, table, entity portfolios.)
- **Layer 2 — live modules (server / wasm):** compute the catalog can't precompute.
  Modules call a SK **remote function** (→ API/model) or run **client-WASM** for light
  work. (live-tuned similarity, prediction scoring, simulation.)

Every module — either kind — receives the **current scope** (the set the rail
produced) and declares its data source:

| Data source | Runs where | Examples |
|---|---|---|
| `client` | DuckDB over the catalog | distributions, scatter, table, search |
| `client-wasm` | in-browser compute | light simulation, small inference |
| `remote` | SK remote fn → API/model | live similarity, prediction scoring, heavy sim |

**A new capability = a new module (+ optional endpoint). The catalog and shell are
never touched.** That is the extensibility guarantee.

### The synergy: the client filter *bounds* live calls

Because filtering happens client-side first, a `remote` module only calls the server
for the games that **survived the filter** — score 180, not 38k. The free client
catalog is a **cheap pre-filter that shrinks the input to expensive live compute**, so
live scoring/similarity/simulation stay fast and cheap.

### Rules that keep live modules from eroding the "$0, instant" property

1. **On-demand, not live-on-keystroke** — live modules run on an explicit action.
2. **Bounded by the filter** — they operate on the narrowed set.
3. **Cached** — same inputs → cached result.
4. **Cost visible** — a module surfaces "scoring 180 games…" so live compute is
   deliberate, never a hidden drip.

## What still talks to BigQuery / the warehouse API

- **Game detail** — point lookups (`GET /games/{id}` and sub-resources). Already built.
- **The daily catalog artifact build** — one narrow scan (~30 MB), in the pipeline.
- **Live modules** — their own endpoints (similarity ML.DISTANCE exists; prediction
  scoring / simulation are per-module work).
- **Kitchen-sink (140k)** — the rare exception that can't ship to the browser; a
  server-side/BQ fallback, not a common path.

## Resolved decisions

1. **Client-side catalog** via DuckDB-WASM over a daily Parquet artifact — not
   per-interaction BQ, not per-view precomputed tables.
2. **Scale-to-zero**, no `min-instances`. Idle ≈ $0.
3. **One unified working set** (~38k, established ∪ upcoming); kitchen-sink is the
   exception.
4. **Two-layer module model** — static (client) + live (remote/wasm) — with the scope
   as the shared contract.
5. **The `GET /games` search/list endpoint is dropped** — search and list are
   client-side over the catalog. *(Confirmed.)*
6. **Artifact build home:** the **SK server materializes + caches** the artifact to
   start (works locally immediately, no cross-repo pipeline change); a **daily
   pipeline → GCS** build is a **later optimization** so the server never runs the
   scan. Delivery is always **through the authed SK server** (locally: a local file);
   the browser re-fetches by version/date.

## Validation — DuckDB-WASM spike (2026-07-28): **PASSED**

Measured in a real browser (Chromium) against the actual 37,633-row working set:

- **Artifact format:** Parquet + zstd wins — **1.79 MB raw / 1.76 MB gzipped** (Arrow
  IPC was ~3.4 MB). This is the chosen format.
- **Cold load:** DuckDB-WASM init 616 ms + fetch 7 ms + register/connect 50 ms ≈
  **~0.7s**; ~1.2s including the one-time cold Parquet parse (first query) — under 2s.
- **Query latency (after warm-up):** filter **16 ms**, group-by histogram **18 ms**,
  array facet `list_contains(categories,…)` **9 ms**, `name LIKE` search **26 ms** —
  all far under the 100 ms bar.
- **Integration:** DuckDB-WASM ↔ SvelteKit/Vite works; array/list columns query
  correctly (facets), search is a `LIKE`. The architecture is de-risked.

Implementation notes carried forward: **prime the Parquet parse** during the loading
state (the ~440 ms first-query cost) so the first interaction is warm; **self-host the
wasm** in the real build rather than the jsDelivr CDN used for the spike.

## Out of scope

- The shell/IA (settled by the mockup) and the detail page (built).
- Specific live modules (similarity explorer, prediction scoring, simulation) — each
  gets its own slice once the foundation lands.
- Deploy/infra specifics (Cloud Run config, Terraform) — a later slice, Actions-only.
