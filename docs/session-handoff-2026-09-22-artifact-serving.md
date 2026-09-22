# Handoff — four of five artifacts are built on demand from BigQuery

**Date:** 2026-09-22
**Status:** superseded for thumbnails — built on `feat/thumbnails-gcs-rail`. See
`docs/superpowers/specs/2026-09-22-thumbnails-gcs-rail-design.md` and its plan. The finding
below stands; three of its recommendations were revised in the doing, marked **[revised]**.
**Scope note:** found while working on the embedding map. It is infrastructure, not
mapping, so it was deliberately split out rather than folded into that branch.

---

## The finding

Only the catalog is served from GCS. Every other artifact is queried out of BigQuery on
demand and cached in-process for its TTL, so the first request after a cold start — or after
the TTL lapses — pays a full BigQuery build.

| artifact | gzipped | served by | `gcs.ts`? |
|---|---|---|---|
| catalog | 5.3 MB | GCS object + pointer + signed URL | yes |
| **similar-explorer** | **9.3 MB** | BigQuery on demand | no |
| thumbnails | 1.8 MB | BigQuery on demand | no |
| coordinates | 1.1 MB | BigQuery on demand | no |
| neighbours | 35 KB | BigQuery on demand | no |

Sizes are the real `.cache/*.gz` files on disk, not estimates.

**Measured cost, coordinates** (`/api/coordinates`, local, stale cache):

```
cold  7.2s   (BigQuery -> 36,277 rows as JS objects -> Arrow -> gzip)
warm  0.008s (in-process cache hit)
```

The query itself is not the problem — 20 MB scanned, trivial. The time goes on the Node
BigQuery client paginating 36k rows into JS objects over REST, then serializing.

`similar-explorer` is 9.3 MB and was not timed. It is the obvious worst case, but it is only
loaded by `/dev/similar` and is not a requirement for now; **time it first** if it comes back.

**[revised]** The "time it first" instruction was right and worth keeping — the prediction
for thumbnails was ~5-7s by analogy with coordinates, and the measurement came back 3.4s.
Pagination cost tracks payload size more than row count, which the analogy got wrong.

## Why the catalog is different

The catalog has a rail nothing else has:

- `src/lib/server/catalog/gcs.ts` — pointer read, v2 signed URL, staleness warning
- `scripts/build-catalog-artifact.ts` — builds, uploads content-hashed, writes pointer LAST
- `.github/workflows/catalog-artifact.yml` — dispatched by the warehouse pipeline

Half the pattern is already shared: `src/lib/server/artifact-cache.ts` (`createArtifactCache`)
gives all five the TTL + disk-mirror behaviour. The missing half is GCS upload + pointer +
signed URL.

**[revised]** That half does *not* generalise by threading a name through. `POINTER` is a
module constant and `pointerCache`/`storage` are module singletons, so a second artifact
sharing `gcs.ts` would share one pointer cache — whichever resolved first would win the TTL
and the other would sign a URL for the wrong object. The read side needed the same factory
shape `createArtifactCache` already has (`src/lib/server/artifact-pointer.ts`), and the
publish side needed the same split (`scripts/lib/publish-artifact.ts`). Two real refactors,
not a rename.

Two details in the existing design that must be preserved when generalising, both
load-bearing and both explained in the source:

1. **The pointer is written last, never in the same operation as the upload.** A reader that
   sees a hash can trust the object exists.
2. **v2 signing, not v4.** A v4 URL embeds `X-Goog-Date`, so its string changes on every call
   and the browser can never match its cache entry — which would make the signed-URL design
   strictly worse than the endpoint it replaced while appearing to work. v2 plus a
   window-anchored expiry makes the URL byte-identical for every request in the window.

## Recommended sequence

1. **[revised] Coordinates stay their own artifact, on the GCS rail** — not folded into the
   catalog. Phil's call, 2026-09-22: the coordinate set is expected to grow to `pc_1 … pc_k`
   for larger *k*, and more components need no new model or pipeline, just more of the
   vector. Inside the catalog every added component taxes every user for a page most
   sessions never open; as its own artifact, widening it costs only the sessions that open
   the map. Deferred here only because none of the coordinates code is on `main` — it
   arrives with PR #71, after which it is a small follow-up on the rail now built.
2. **[revised] Generalise the GCS rail** for `thumbnails`. Done. similar-explorer is not a
   requirement for now (Phil, 2026-09-22) and rides the same rail unchanged whenever it is.

   The size was measured, and it is smaller than this document implies: rebuilding
   thumbnails from BigQuery is **3.4s** for the query, against **~0.1s** to fetch the
   published object (measured as 0.3s for the catalog's 5.28 MB, scaled). Real, but the
   argument is less "seconds off a page load" than "a cold container stops doing 3.4s of
   BigQuery work and 1.8 MB of egress, forever" — plus the reuse.
3. **Future big artifacts** — a game network, a higher-dimensional coordinate set — then ride
   an existing rail instead of growing new machinery. This is the actual argument for doing
   step 2 properly rather than bolting GCS onto one artifact.

The thing to avoid: building a bespoke GCS path for coordinates alone. That pays for the
machinery and gets none of the reuse.

## Also worth knowing

**Dev server port is back to 5173.** It had been moved to 4300, which took local dev off the
artifacts bucket's CORS allow-list (`https://boardgame-viz.com`, `www.`, `http://localhost:5173`).
The catalog is fetched *by the browser* from a signed GCS URL, so an origin missing from that
list cannot load it — and it presents as "the catalog failed to load" while the server is
entirely healthy: ADC signs fine, the endpoint returns 200, the artifact is fresh. It cost an
hour. **Moving the dev port again means adding the new origin to the bucket first**; both
`justfile` and `vite.config.ts` now carry that warning.

Note this becomes a wider problem as more artifacts move to GCS — every one of them inherits
the same CORS dependency.

**Local credentials are fine** (Windows machine, 2026-09-22). ADC is an impersonated service
account, `bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`, and it works: GCS reads,
pointer, v2 signing and BigQuery all verified directly. Impersonating locally is deliberate.
Do not go looking for a credentials problem — an older handoff describes a
`GOOGLE_APPLICATION_CREDENTIALS`/`adc-aebs.json` issue that belongs to a *different machine*
and does not apply here. (Chasing it cost time today.)

**`OFFLINE=1`** serves every artifact from its `.cache/` mirror and ignores TTLs. It is the
fastest way to work without paying cold starts, and worth reaching for before diagnosing a
slow load.

## Not in this handoff

The mapping work this was found during is on **`dev/map-perf-and-rail`** (local, unpushed,
branched off `feat/embedding-map` / PR #71): query-path and per-frame performance fixes, the
scope rail added to the map, and the port revert. That branch is its own concern; nothing here
depends on it and it does not depend on anything here.

Two known-open items on it, both reviewed and deliberately not fixed: a stale draw-order
permutation window in `PointCanvas` (`order`/`slot` are published before regl receives the
permuted arrays, so hover and selection rings can mis-map for up to a transition), and dead
`keep` branches in `MapLayer` whose comments still describe the hiding model that dimming
replaced.

## Verify

```sh
pnpm exec svelte-check --tsconfig ./tsconfig.json   # 0 errors; 9 pre-existing AnalysisPanel warnings
pnpm exec vitest run                                # 418 passing on this branch; main is 298
```

Ask before starting the dev server — Phil runs his own on 5173.
