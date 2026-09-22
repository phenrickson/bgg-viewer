# Thumbnails on the GCS rail — implementation plan

Spec: `docs/superpowers/specs/2026-09-22-thumbnails-gcs-rail-design.md`
Finding: `docs/session-handoff-2026-09-22-artifact-serving.md`

## Goal

Move the thumbnails artifact off request-time BigQuery and onto the catalog's CI → GCS →
signed-URL rail, generalising that rail on the way so the next artifact is a handful of
lines rather than a second copy of the machinery.

**Success:** `/api/thumbnails` returns a signed GCS URL for an artifact built in CI; the
browser fetches 1.84 MB from GCS instead of Cloud Run; a cold container never queries
BigQuery for box art; `OFFLINE=1` and `THUMBNAILS_SOURCE=bigquery` both still serve it; the
catalog path is byte-for-byte unchanged in behaviour; `just check` and `pnpm test` pass.

**Explicitly not in scope:** similar-explorer, coordinates, neighbours, and any change to
what the thumbnails artifact contains.

## Affected surfaces

| file | change |
|---|---|
| **new** `src/lib/server/artifact-pointer.ts` | pointer factory, generalised out of `catalog/gcs.ts` |
| **new** `src/lib/server/artifact-pointer.test.ts` | factory tests (per-instance cache, v2 signing, window anchoring, staleness) |
| `src/lib/server/catalog/gcs.ts` | becomes a factory instance; exported names unchanged |
| `src/lib/server/catalog/gcs.test.ts` | should pass untouched — that is the check |
| **new** `src/lib/server/thumbnails/gcs.ts` | second instance |
| **new** `scripts/lib/publish-artifact.ts` | hash / gzip / skip-if-present / upload / pointer-last |
| `scripts/build-catalog-artifact.ts` | keeps its query, calls the helper |
| **new** `scripts/build-thumbnails-artifact.ts` | thumbnails entry point |
| `.github/workflows/catalog-artifact.yml` → `viewer-artifacts.yml` | rename + second build step |
| `src/routes/api/thumbnails/+server.ts` | signed-URL first, byte fallback, `THUMBNAILS_SOURCE` |
| `src/routes/api/catalog/+server.ts` | `isOffline()` guard only |
| **new** `src/lib/catalog/artifact-fetch.ts` | `fetchArtifactBytes` — the two-shape reader |
| `src/lib/catalog/catalog.svelte.ts` | `fetchCatalogBytes` + `loadThumbnails` use it |
| `src/lib/catalog/thumbnails.ts` | `fetchThumbnailMap` uses it |
| `docs/session-handoff-2026-09-22-artifact-serving.md` | correct the "already parameterised" line |

No terraform. No IAM. No `columns.ts`. No new dependencies.

## Reuse

- **`createArtifactCache`** (`src/lib/server/artifact-cache.ts`) is the shape to copy for
  the pointer factory: one instance per artifact, closure state, a `reset()` test seam, and
  injectable clock/disk seams so tests never touch the network.
- **`/api/catalog/+server.ts`'s two-shape structure** — auth gate, try-GCS, `console.error`
  and fall through, ETag/304 on the byte path — is the template for `/api/thumbnails`. Its
  comments explain why the fallback is deliberately not fatal; carry that reasoning over.
- **`fetchCatalogBytes`** (`catalog.svelte.ts:72-85`) is already the two-shape client
  reader, including the no-credentials rule for the cross-origin GCS fetch. Step 5 promotes
  it rather than writing a second one.
- **`WORKING_SET_WHERE`** is already shared by both queries, so the two artifacts cannot
  drift onto different row sets. Nothing to do; do not break it.

## Steps

Each step is its own PR off `main`, in this order. Branch names suggested; **Phil merges —
never `gh pr merge`**, and check `gh pr view --json state,mergedAt` before pushing to a
branch that has been open a while.

---

### Step 0 — Measure, before writing anything

`perf/measure-thumbnails-build` — no PR, a number in the thread.

Time a cold `/api/thumbnails` locally with a stale `.cache/thumbnails.arrow.gz`, the same
way coordinates was measured (7.2s cold / 0.008s warm). Record the split: BigQuery execution
vs REST pagination vs Arrow+gzip.

**Verification:** a number. **If the cold build lands near 2s rather than near 7s**, stop and
re-open open question 1 in the spec — the reuse argument alone may not justify the sequence,
and a different artifact may deserve the slot.

---

### Step 1 — Extract the pointer factory

`refactor/artifact-pointer-factory` — pure refactor, no behaviour change, no new artifact.

Create `artifact-pointer.ts` with `createArtifactPointer({ pointerName, label })`. Move
`WINDOW_MS` / `EXPIRY_MS` / `POINTER_TTL_MS` / `windowStart` / the pointer read / the
signing / the staleness warning into it, **with their comments intact** — particularly the
v2-not-v4 rationale and the "pipeline may have stopped firing" warning. `pointerCache`
becomes closure state; `storage` stays a module singleton.

Rewrite `catalog/gcs.ts` as an instance re-exporting `getCatalogPointer`,
`getSignedCatalog`, `_resetPointerCache` and the `CatalogPointer` / `SignedCatalog` types.

**Verification:**
- `pnpm exec vitest run src/lib/server/catalog/gcs.test.ts` — **passes unmodified**. If that
  file needs editing, the extraction changed behaviour; go back.
- New `artifact-pointer.test.ts`: two instances keep **separate** pointer caches (the actual
  bug the module-level singleton would have caused); `getSignedArtifact` asks for `v2`; the
  expires value is identical for two clocks inside one 24h window and differs across the
  boundary; `stale` flips at 36h.
- `just check`.

---

### Step 2 — Extract the publish helper (still catalog-only)

`refactor/publish-artifact-helper` — pure refactor.

`scripts/lib/publish-artifact.ts` takes `{ bucket, prefix, pointerName, raw, rows }` and does
hash → gzip → skip-if-exists → upload → **pointer last**. `build-catalog-artifact.ts` keeps
its BigQuery query and `rowsToArrowIPC` call and hands the bytes over.

The `versionOf` in the helper must stay **identical to `artifact-cache.ts`'s** — sha256 of
the *uncompressed* bytes, first 16 hex. The two are a matched pair and a drift there makes
the fallback path's ETag disagree with the GCS path's hash.

**Verification:**
- `pnpm dlx tsx@4 scripts/build-catalog-artifact.ts` against the real bucket prints
  `artifact already present — skipping upload` and rewrites the pointer to **the same hash**
  it currently names. That is the whole proof: same bytes, same name, no new object.
- `just check`.

---

### Step 3 — Build and publish thumbnails in CI

`feat/thumbnails-artifact-publish` — publishes the artifact; nothing reads it yet.

`scripts/build-thumbnails-artifact.ts` (query from `thumbnails/columns.ts`, serializer from
`thumbnails/serialize.ts`, pointer `thumbnails-current.json`, prefix `thumbnails`), plus the
zero-row guard. Rename the workflow to `viewer-artifacts.yml`, add the second step after the
catalog step, keep `repository_dispatch: [catalog_refresh]` and the `concurrency` group, and
keep the `pnpm dlx tsx@4`-not-a-devDependency comment.

**Deliberately split from step 4.** Publishing before reading means the pointer exists
before any code depends on it, so step 4 never ships into an empty bucket.

**Verification:**
- `workflow_dispatch` the renamed workflow; it publishes both artifacts and stays green.
- `gsutil cat gs://bgg-data-warehouse-bgg-viewer-artifacts/thumbnails-current.json` names an
  object that exists, with a plausible `rows` (~36k) and `bytes` (~1.8 MB).
- Re-run it: the second run skips the upload and only rewrites the pointer.
- Grep the repo for `catalog-artifact.yml` — the only references are comments in
  `build-catalog-artifact.ts` and the docs; update them.

---

### Step 4 — Serve and read the signed URL

`feat/thumbnails-signed-url`

`thumbnails/gcs.ts` (one factory instance), `/api/thumbnails` gaining the signed-URL-first
shape with its fallback and `THUMBNAILS_SOURCE=bigquery` hatch, `artifact-fetch.ts`, and the
three client call sites moved onto it.

Order within the PR matters for deploy safety: the client handles both shapes, so server and
client can deploy in either order and a rollback of either one is safe.

**Verification:**
- `just dev` on **5173** (the CORS-allowed origin), signed in: box art loads on `/games`;
  DevTools shows the artifact fetched from `storage.googleapis.com`, not from the app origin.
- The game detail page's "Similar games" list still shows art — that is `fetchThumbnailMap`,
  the DuckDB-free reader, and it is the call site most likely to be forgotten.
- `THUMBNAILS_SOURCE=bigquery just dev` — box art still loads, now from the endpoint.
- `OFFLINE=1 just dev` — box art loads from `.cache/thumbnails.arrow.gz` with **no GCS call
  in the logs** (this is what step 6 of the spec buys; see step 5 below).
- Break it on purpose: point `CATALOG_BUCKET` at a nonexistent bucket and confirm box art
  still appears via the BigQuery fallback, with the `console.error` in the logs.
- `just check`, `pnpm exec vitest run`.

**Ask before starting a dev server — Phil runs his own on 5173.**

---

### Step 5 — Fix the offline/GCS ordering

`fix/offline-skips-gcs` — one guard in each endpoint.

Skip the signed-URL attempt when `isOffline()`. Fold into step 4 if it is one line in
practice; kept separate here because it changes the *catalog* path, and a catalog regression
should not be buried in a thumbnails PR.

**Verification:** `OFFLINE=1 just dev` with the network down serves both artifacts from
`.cache/` with no GCS attempt logged. Today the catalog only gets there via a caught failure.

---

### Step 6 — Correct the handoff

`docs/handoff-correction` — or folded into step 1's PR.

Fix the "`gcs.ts` is already parameterised by bucket and pointer name" line, which
understates step 1 and would make the work look late. Point the handoff at this spec and
plan, and mark similar-explorer as deferred by decision rather than pending.

---

## Risks, unknowns, rollback

- **Getting the pointer/upload order wrong is the one real hazard.** A pointer naming an
  object that is not there yet is a hard 404 for every reader at once. Step 2 keeps that
  ordering in one function precisely so it cannot be re-derived incorrectly per artifact.
- **`versionOf` drift** between `publish-artifact.ts` and `artifact-cache.ts`. Nothing
  compares the two at runtime — the ETag belongs to the byte-fallback path and the pointer
  hash to the GCS path, and no client reads both — so drift breaks *diagnosis*, not
  correctness: "does the published artifact match what I'd build locally" stops being
  answerable. Still worth asserting in a test, but it is not the hazard the earlier draft of
  this plan implied.
- **v4 signing creeping in** — via a copy-paste, a library default change, or someone
  "fixing" the deprecated v2 API. The symptom is silent: everything works, and every visit
  re-downloads the artifact. The factory test asserting `version: 'v2'` is the guard.
- **CORS.** No change needed now, but the rail's blast radius grows with each artifact on
  it, and the failure presents as an app bug with entirely healthy server signals. Moving
  the dev port means editing `terraform/storage.tf` **first**.
- **Cross-repo coupling.** The warehouse dispatches `catalog_refresh`. Keeping that type is
  what makes this a single-repo change; renaming it would need a coordinated merge.
- **Not credentials.** Local ADC is an impersonated service account
  (`bgg-viewer@bgg-data-warehouse.iam.gserviceaccount.com`) and is verified working on this
  machine. An older handoff describes a `GOOGLE_APPLICATION_CREDENTIALS` problem belonging
  to a *different* machine; chasing it has already cost time once.
- **Rollback.** Every step is independently revertible, and the running system has two
  fallbacks under it: `THUMBNAILS_SOURCE=bigquery` restores the old path with an env change
  and no redeploy, and even without that, any GCS failure already degrades to the BigQuery
  build. Worst case beyond both of those is the initials placeholder — never a broken page.
- **Unknown:** whether the workflow rename disturbs anything in the warehouse's dispatch
  step. Grep confirms nothing in this repo references the filename except comments; confirm
  the warehouse side targets the *event type*, not the file, before merging step 3.

## Out of scope

similar-explorer, coordinates (which the handoff argues belong in the catalog artifact as
columns, not on this rail), neighbours, the thumbnails column set, the DuckDB table shape,
and any generic artifact registry. Also out: the two known-open items on
`dev/map-perf-and-rail` (the stale `PointCanvas` draw-order window and the dead `keep`
branches in `MapLayer`) — that branch is a separate concern and nothing here depends on it.
