# Thumbnails on the GCS rail — design

**Date:** 2026-09-22
**Status:** Design proposed, not yet agreed
**Follows:** `docs/session-handoff-2026-09-22-artifact-serving.md`

## Problem

Five artifacts are served to the browser. One of them — the catalog — is built in CI and
published to GCS. The other four are queried out of BigQuery *inside the Cloud Run process*
on a TTL, so every cold container pays a full build on the first request that wants one.

| artifact | gzipped | built where | in the critical path? |
|---|---|---|---|
| catalog | 5.26 MB | CI → GCS | yes (first filter) |
| similar-explorer | 9.33 MB | request time | no |
| **thumbnails** | **1.84 MB** | **request time** | no (cosmetic) |
| coordinates | 1.16 MB | request time | no (map page only) |
| neighbours | 35 KB | request time | no |

This spec covers **thumbnails**, because it is the only one of the four that exists on
`main`. Coordinates, similar-explorer and neighbours all live on the unmerged map branch
(PR #71) — `src/routes/api/` here has only `catalog`, `collection` and `thumbnails`. See
*Not doing*.

### What the cost actually is

Coordinates was measured on 2026-09-22: **7.2s cold, 0.008s warm**, over 36,277 rows. The
BigQuery scan is 20 MB and executes in about two seconds; the rest is the Node BigQuery
client paginating 36k rows into JS objects over its JSON REST API, then Arrow-encoding and
gzipping them. This is the same profile the catalog was moved to GCS to escape — its own
build was 14.6s, of which 12.0s was REST pagination, 1.9s scan, 725ms serialization.

Thumbnails has the **same row count and the same working-set filter** (it reuses
`WORKING_SET_WHERE` from `catalog/columns.ts`) and two columns, one of which is a URL string
of roughly 100 bytes. Pagination cost tracks row count far more than column count, so the
expected cold build is the same order as coordinates. **Measure it before building** — the
plan's step 0 — so this is justified by a number and not by an analogy.

### Why it is worth fixing even though nothing blocks on it

Box art is deliberately non-blocking: `loadThumbnails()` is fired after
`status = 'ready'`, and a failure degrades to the initials placeholder
(`catalog.svelte.ts:130-160`). So the user-visible symptom is mild — art pops in several
seconds late on a cold container. Three things make it worth doing anyway:

1. **It is serving-process work, not user-wait work.** For those seconds a Cloud Run
   instance is paginating 36k rows and gzipping 1.8 MB while also rendering pages. On a
   scale-to-zero service the cold container is, by definition, the one under load.
2. **1.8 MB per cold cache leaves through Cloud Run**, per container, forever. The catalog
   move took 5.26 MB off that path; this takes the next-largest routine chunk.
3. **It is the cheapest place to generalise the rail.** Thumbnails is small, its failure
   mode is already graceful, and its client contract is trivial. Doing the generalisation
   here means coordinates, similar-explorer and any future artifact ride an existing rail
   instead of growing new machinery — which is the actual argument, and the reason to do it
   properly rather than bolt GCS onto one more artifact.

### Why the rail is not reusable as it stands

The handoff says `gcs.ts` "is already parameterised by bucket and pointer name". That is not
right, and the correction matters for estimating the work:

- `POINTER` is a module-level constant (`gcs.ts:30`), hardcoded to `catalog-current.json`.
- `pointerCache` and `storage` are module-level singletons (`gcs.ts:34-35`). A second
  artifact sharing this module would share one pointer cache and serve the wrong hash.
- Only the *bucket* is env-configurable, and the bucket is shared by all artifacts anyway,
  so that is the one axis that did not need parameterising.

`createArtifactCache` is the shape the read side needs and does not have: a factory, one
instance per artifact, each with its own state.

The publish side has the same problem in a milder form — `scripts/build-catalog-artifact.ts`
is a single `main()` with the pointer name, object prefix, query and serializer inlined.

## Design

### 1. A pointer factory, mirroring `createArtifactCache`

`src/lib/server/artifact-pointer.ts` — new, generalised out of `catalog/gcs.ts`:

```ts
createArtifactPointer({ pointerName, label }) => {
  getPointer(clock?, read?): Promise<ArtifactPointer>
  getSignedArtifact(clock?, sign?, read?): Promise<SignedArtifact>
  reset(): void
}
```

One instance per artifact, each with its own `pointerCache`. The `Storage` client stays a
module singleton — it is stateless per-artifact and there is no reason to hold two.

`catalog/gcs.ts` becomes a thin instance plus its existing exported names
(`getCatalogPointer`, `getSignedCatalog`, `_resetPointerCache`), so no call site or test
changes. `thumbnails/gcs.ts` is a second instance and nothing else.

**Two properties must survive the move verbatim, with their comments:**

1. **v2 signing, not v4, with a window-anchored expiry.** A v4 URL embeds `X-Goog-Date`, so
   its string changes on every call and the browser can never match a cache entry — which
   makes the signed-URL design strictly worse than the endpoint it replaces while appearing
   to work. `windowStart()` floors to a fixed 24h boundary so the URL is byte-identical for
   every request in the window, across containers.
2. **The staleness warning.** The old TTL self-healed; an event-triggered build can simply
   stop firing, and a stale artifact looks exactly like a fresh one. 36h threshold.

The staleness threshold stays 36h for thumbnails even though box art almost never changes —
the signal is about the *pipeline having stopped*, not about the data being wrong.

### 2. A publish helper, and a second entry script

`scripts/lib/publish-artifact.ts` — the parts of `build-catalog-artifact.ts` that are not
about the catalog:

- hash the uncompressed bytes with the exact `versionOf` that `artifact-cache.ts` uses
- gzip, name `<prefix>-<hash>.arrow.gz`
- **skip the upload when the hash already exists** (re-uploading resets the age the
  lifecycle rule measures from and busts a `Cache-Control` window browsers are inside)
- **write the pointer LAST, never in the same operation**, so a reader that sees a hash can
  trust the object exists
- refuse to publish zero rows

`build-catalog-artifact.ts` keeps its query and calls the helper. `build-thumbnails-artifact.ts`
is new and does the same, reusing `thumbnails/columns.ts` and `thumbnails/serialize.ts`.

Two thin entry scripts rather than one script with an argv registry: the workflow stays
readable as two named steps, and a failure names the artifact without anyone parsing a log.

**The scripts must keep using `columns.ts` and `serialize.ts` rather than a hand-written
copy of the query.** That shared definition is why the BigQuery SELECT and the Arrow schema
cannot drift, and it is the stated reason these scripts are TypeScript-run-via-tsx at all.

### 3. One workflow, two artifacts

`.github/workflows/catalog-artifact.yml` → `viewer-artifacts.yml`: same checkout, same
auth, same `pnpm install`, one extra `pnpm dlx tsx` step.

**The `repository_dispatch` type stays `catalog_refresh`.** It is sent by the warehouse's
`dataform.yml` from its terminal `embeddings_complete` branch, and renaming it would be a
coordinated cross-repo change for no benefit. The workflow's display name and comments
change; the trigger does not.

Catalog is published first, thumbnails second. A thumbnails failure therefore fails the run
*after* the catalog pointer has already landed, and it fails loudly rather than being
swallowed by `continue-on-error`. Both artifacts share the existing `concurrency` group.

`pnpm dlx tsx@4`, not a devDependency — adding `tsx` to `package.json` satisfies one of
vite's optional peer deps, which re-resolves its peer set, drags in `esbuild` with its
postinstall, and breaks the Dockerfile's `--frozen-lockfile --prod` install. That comment
already exists in the workflow and must not be lost in the rename.

### 4. `/api/thumbnails` answers in two shapes

Exactly `/api/catalog`'s structure: auth gate unchanged, try the signed URL, and on any
failure fall through to the existing byte-streaming path with its ETag and 304. GCS being
unreachable, a pointer absent before the first run, or a signing permission gap all degrade
to the path that worked yesterday rather than taking box art away.

`THUMBNAILS_SOURCE=bigquery` is the matching escape hatch, restoring the old path without a
redeploy.

### 5. One client-side fetch helper for both shapes

`src/lib/catalog/artifact-fetch.ts` — `fetchArtifactBytes(endpoint)`: if the response is
JSON, read `{ url }` and fetch the bytes from GCS **without credentials** (the signature is
the authorisation; sending cookies cross-origin would only invite a preflight failure);
otherwise return the body directly.

Three call sites collapse onto it: `fetchCatalogBytes`, `loadThumbnails`
(`catalog.svelte.ts`), and `fetchThumbnailMap` (`lib/catalog/thumbnails.ts`, the
DuckDB-free reader the game detail page uses). Handling both shapes is what lets client and
server deploy in either order — and the second and third call sites are the ones that do not
handle it today, so this is required, not tidying.

### 6. A latent bug to fix on the way past

`/api/catalog` tries `getSignedCatalog()` **before** consulting offline mode, so `OFFLINE=1`
still reaches out to GCS and only lands on the disk mirror by way of a caught failure.
`isOffline()` lives inside `artifact-cache`, and the GCS path bypasses that cache entirely.

Both endpoints should skip the GCS attempt when `isOffline()`. It is a one-line guard, it is
the difference between offline mode working and offline mode working by accident, and
thumbnails would otherwise inherit the same shape.

### What needs no change

- **Bucket CORS.** `bgg-data-warehouse/terraform/storage.tf:66-71` already allows
  `https://boardgame-viz.com`, `https://www.boardgame-viz.com` and `http://localhost:5173`
  for GET/HEAD, and thumbnails lives in the same bucket. **No terraform change, no deploy.**
  The dependency is inherited, though: every future artifact on this rail is unreachable
  from any origin not on that list, and it presents as "failed to load" while the server is
  entirely healthy — ADC signs fine, the endpoint returns 200, the artifact is fresh. Moving
  the dev port again means adding the origin to the bucket first.
- **The 30-day lifecycle rule**, which is already well beyond any signed URL's 24h life.
- **`thumbnails/columns.ts`.** The artifact stays two columns. The DuckDB table is created
  as `(game_id INTEGER, thumbnail VARCHAR)` and adding a column breaks the Explore box art
  join; enrich the warehouse instead.
- **IAM.** The CI service account already writes this bucket; the runtime account already
  reads and signs.

## Not doing

- **Coordinates — deferred, not rejected.** It has the only *measured* cold build (7.2s) and
  is the artifact that most deserves this treatment. It is out of scope here only because
  its code is not on `main` yet; it arrives with PR #71. It should then ride this rail as
  **its own artifact**, not be folded into the catalog as the handoff suggested: the
  coordinate set is expected to grow to `pc_1 … pc_k` for larger *k*, and the v1 map spec
  established that more components need no new model or pipeline, just more of the vector.
  Inside the catalog, every added component taxes every user for a page most sessions never
  open. As its own artifact, widening it costs only the sessions that open the map. Once
  #71 lands this is a small follow-up — one `gcs.ts` instance, one build script, one
  workflow step, one endpoint, one client call site — precisely because the rail built here
  already exists.

- **similar-explorer (9.33 MB).** Not a requirement now. It is the largest artifact and
  probably the largest win, but it is only loaded by `/dev/similar`, and everything built
  here applies to it unchanged whenever it is wanted — one `gcs.ts` instance, one entry
  script, one workflow step, one endpoint edit.
- **neighbours (35 KB).** Too small to be worth an object.
- **Changing what box art is or where it comes from.** Same query, same two columns, same
  DuckDB table. Only the delivery path moves.
- **Promoting the rail into a generic "artifact registry"** with one table of definitions.
  Two artifacts do not justify that shape; five might. The factory split here is the part
  that pays off either way.

## Open questions

1. **Does the measured cold build justify it?** If thumbnails comes in near 2s rather than
   near 7s, the case rests on reuse alone and the sequence should probably move straight to
   whatever the next big artifact is.
2. **Should the thumbnails pointer TTL differ from the catalog's 60s?** Probably not — the
   pointer read is one small object and 60s is already generous.
