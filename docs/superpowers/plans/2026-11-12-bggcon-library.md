# BGG.CON library — implementation plan

**Spec:** `docs/superpowers/specs/2026-11-12-bggcon-library-design.md`
**Date:** 2026-11-12

## Goal and success criteria

At BGG.CON, on his phone, Phil can:
- open `/bggcon` and see his starred library games, available ones first, with availability
  no more than about a minute old;
- star games from the laptop and see the same stars on the phone;
- narrow Explore, the map and Recommend to the con library.

Before the con, Phil can review all of it on the MacBook against the dev server on the PC.

## Delivery

There are four PRs in two repos (a fifth, the report, comes after the con). Phil merges every
PR. Development never happens on `main`. Each tested step is committed and pushed as it's done.

| # | Repo | Branch | Depends on |
|---|---|---|---|
| 1 | bgg-viewer | `feat/dev-lan-artifacts` (from `main`) | nothing |
| 2 | bgg-data-warehouse | `feat/terraform-bggcon-writer` (merged) | nothing |
| 3 | bgg-viewer | `feat/bggcon-library` (holds the spec and this plan) | #2 deployed; #1 for MacBook review |
| 4 | bgg-data-warehouse | `feat/bggcon-recorder` (from `main`) | the library snapshot from #3's daily job |
| 5 | bgg-data-warehouse | `feat/bggcon-report` (after the con) | data recorded by #4 |

**Order against the con (opens 9:00 AM Central, Wed 18 Nov 2026):** finish #3 (dashboard and
stars), then **#4 must be deployed and recording before then.** Aim for Tue 17 Nov, so there's a
day of data and a first bill to check. Missed minutes can't be recovered. #5 can wait until
after the con.

---

## PR 1: dev server usable from another machine on the LAN

**Problem.** `just dev-mobile` already listens on the LAN, but the browser loads four artifacts
(catalog, thumbnails, vectors, coordinates) from **signed GCS URLs**. The bucket's CORS list
allows `http://localhost:5173` and not `http://<pc-ip>:5173`, so from the MacBook the
browser blocks those loads and nothing reports an error.

**Change.**
- `src/lib/server/artifact-pointer.ts`: when a dev-only flag is on (`ARTIFACTS_VIA_SERVER`,
  checked behind SvelteKit's `dev` guard like `isOffline()`), `getSignedArtifact` returns a
  same-origin URL, `/api/dev/artifact?name=<object>`, instead of a signed GCS URL. The
  pointer, hash and stale check stay the same. The client code doesn't change, because it
  already follows `url`.
- New route `src/routes/api/dev/artifact/+server.ts`:
  - It returns 404 unless `dev` and the flag are both on, and 401 when nobody is signed in.
  - It only serves object names matching the artifact naming pattern, so it can't read
    arbitrary objects.
  - It downloads the object with the existing `Storage` client and streams the bytes back.
    Content-type and encoding are preserved (see the risk on gzip below).
- `justfile`: `dev-lan` sets the flag and runs `vite dev --port {{port}} --host`. The recipe
  comment covers the one-time Windows Firewall rule (allow node.exe inbound on Private
  networks), and says to open Vite's printed `Network:` URL on the MacBook. The port stays
  5173 and nothing else moves.
- `.env.example`: documents the flag.

**Verification.**
- Vitest: with the flag off, `getSignedArtifact` returns the signed URL exactly as before. With
  it on, it returns the same-origin URL.
- Vitest: the route returns 404 outside dev and 401 when signed out, and refuses a name
  outside the pattern.
- `just verify`.
- Phil runs `just dev-lan` on the PC and opens the `Network:` URL on the MacBook. Explore's
  plot draws, box art shows, and the Recommend and map pages load.

**Risk.** GCS may store the artifacts with `Content-Encoding: gzip`. The Node SDK's
`download()` decompresses by default, so the route must send either raw bytes with no
encoding header, or the stored bytes with the stored header, and never a mix of the two. A
test covers this, and the real check is the MacBook load.

---

## PR 2: let bgg-viewer write under `bggcon/` in its artifacts bucket

**Change.** In bgg-data-warehouse `terraform/viewer.tf`, next to `bgg_viewer_artifacts_reader`:

```hcl
resource "google_storage_bucket_iam_member" "bgg_viewer_bggcon_writer" {
  bucket = google_storage_bucket.bgg_viewer_artifacts.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.bgg_viewer.email}"
  condition {
    title      = "bggcon-prefix-only"
    expression = "resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.bgg_viewer_artifacts.name}/objects/bggcon/\")"
  }
}
```

A comment explains that the grant is temporary for BGG.CON 2026, and that the condition keeps
the account away from catalog artifacts and pointers. The bucket needs uniform bucket-level
access for an IAM condition; check that in `storage.tf` before opening the PR.

**Verification.**
- `terraform.yml` plan output on the PR shows exactly one added member and no other changes.
- After Phil merges and the workflow applies, PR 3's first prod write (the stars file) is the
  proof.

**Rollback.** Revert the PR. Once the con is over, the revert *is* the cleanup.

---

## PR 3: the BGG.CON feature (`feat/bggcon-library`)

The steps are in priority order, so the page and stars are ready first if time runs short.
Each step is a commit (or a few) on the branch, pushed when tested.

### 3a. Tabletop.Events client and grouping (pure logic first)

- `src/lib/server/bggcon/tte.ts` handles fetches:
  - `fetchLibraryPage(n)` and `fetchCheckedOutPages()`;
  - 100 per page, which is the API's cap (it silently drops to 25 above that);
  - requests run one at a time, never in parallel;
  - a short timeout per request.
- `src/lib/server/bggcon/group.ts` is pure:
  - `groupLibrary(rows)` drops rows that aren't in circulation and expansions (`ItemType`),
    then groups by `bgg_id` into `{ bgg_id, name, copies, play_to_win, copy_ids }`;
  - `availability(library, checkedOutIds)` computes, per game, `{ available: copies − out, copies }`;
  - rows with no `bgg_id` are counted, not thrown away silently.
- **Tests:** Vitest with a recorded fixture (a trimmed real page in `src/lib/server/bggcon/__fixtures__/`).
  They cover:
  - copies grouping;
  - out-of-circulation rows;
  - expansions;
  - a missing `bgg_id`;
  - a game where every copy is checked out.
- **First, check what `ItemType` values exist**, from one full pull run as a script into the
  scratchpad (not committed). The expansion filter needs the real values.

### 3b. Server caches and routes

**Revised during the build (2026-11-12, Phil):** the universe and availability are kept apart.
The first version rebuilt the library on a page load. A live run took **114 s**, and
availability needed copy ids from the snapshot.

- `store.ts` reads and writes JSON under `bggcon/` through the shared bucket client. The app
  writes only stars.
- `snapshot.ts` is pure: `buildSnapshot` and `assertUsable`, shared by the job and the app.
- `scripts/build-bggcon-library.ts` and `.github/workflows/bggcon-library.yml` build the
  universe **daily** (cron at 10:00 UTC, plus `workflow_dispatch`) with the CI identity. An
  empty pull fails the run.
- `library.ts` only reads the snapshot (30 min in memory). With no snapshot, the error says to
  run the workflow.
- `checked-out.ts` holds checked-out counts per `bgg_id` from the checked-out rows alone, with
  a 60 s TTL. On failure it serves the last value (`ttl-value.ts`) marked `stale`.
- Routes, all `isAdmin`-gated (401 signed out, 403 for non-admins):
  - `GET /api/bggcon/library`
  - `GET /api/bggcon/availability` (optional `?ids=`)
  - `GET` and `PUT /api/bggcon/stars`
- **Tests:**
  - TTL and in-flight behavior with an injected clock, as in `cache.test.ts`;
  - the stale fallback;
  - the auth matrix on each route;
  - the stars `PUT` checks its body (an array of positive ints with a sane max length).

**Reordered 2026-11-12 after the mockup** (spec §4). The page itself needs the library inside
DuckDB, so the catalog integration now comes first.

### 3c. The library in the browser's catalog (the foundation)

- `catalog.svelte.ts`:
  - a `con_library (game_id, copies, play_to_win)` table and a `con_checked_out (game_id, n)`
    table;
  - `applyConLibrary` / `clearConLibrary`, mirroring `applyCollectionFilter`;
  - `appendCollectionFilter` also ANDs library membership, and "available now" when that's on.
    That one function feeds Explore and the map, so no call site changes.
- **Measure and report the catalog match rate** (library ids found in the catalog).
- **Tests:** Vitest for the where clause with the collection filter, the library filter,
  available-now, and combinations of them.

### 3d. Stars

- `src/lib/bggcon/stars.svelte.ts` is the one client store. It updates optimistically, `PUT`s
  the change, and reverts with a message if the save fails. Every star button uses it.

### 3e. The `/bggcon` dashboard (spec §4, the mockup)

- `src/routes/(app)/bggcon/`: admin-gated, built on Explore's shell, `Rail` (with search and
  collapsed groups), the `.chead` counts, `SegmentedControl` (Focus list | Whole library),
  `SimilarRow onopen` rows, the open-in-place panel, and the **Not in catalog** view (spec §4).
- Whole-library paging and sorting in DuckDB, the way `GameList` does it.
- The panel's "Like this, in the library" uses `rankShelf(vectors, id, libraryIds, n)`.
- The 60 s visible-only refresh feeds `con_checked_out`.
- **Verification:**
  - `just check`;
  - Phil reviews it on his dev server, light and dark, and on the MacBook via `just dev-lan`;
  - phone width.

### 3f. The library in Explore and Recommend

- `Rail.svelte`: an admin-only "BGG.CON library" switch next to "My Collection" (same markup),
  with a chip through `FilterChips`' extra-chip slot. In Explore and the map, a star appears on
  rows while it's on.
- Recommend: a `'library'` pool, admin-only, using the existing `rankShelf`.
- **Tests:** a `rankShelf` test with a library-sized id set; the existing tests stay green.

### PR 3 wrap-up

- `just verify`.
- A PR description that lists the removal steps (spec §7), so cleaning up after the con is
  mechanical.

---

## PR 4: the recorder and alerts (bgg-data-warehouse, spec §8)

- **Job:** a small Python job in the warehouse's own style (uv, `src/`, pytest), deployed as a
  **Cloud Run job**. Each run does the following:
  1. Reads its state file: the previous checked-out copy ids, and the next allowed run time
     (used for backoff).
  2. Fetches the checked-out copies (one at a time, at most 100 per page).
  3. Compares with the previous set. Each new copy is an `out` event; each copy that's gone
     is an `in` event.
  4. Inserts the events and one heartbeat row (`bggcon_runs`) into BigQuery.
  5. For each `in` event, checks the focus list (`bggcon/stars/…`) and copy counts
     (`bggcon/library.json`). It sends an ntfy push when a starred game goes from every copy
     out to at least one on the shelf.
  6. Saves the new state file.

  On a 429 or 5xx it writes a failed heartbeat, pushes the next allowed run time out to 5
  minutes, and exits.
- **Terraform** (through `terraform.yml`):
  - the Cloud Run job;
  - a Cloud Scheduler job, every minute, `America/Chicago`, library hours once known;
  - the two raw BigQuery tables, partitioned by day;
  - the ntfy topic as a Secret Manager secret;
  - read access for the job's service account to the viewer bucket's `bggcon/`.
  - Cost guards: no retries, a 60 s timeout, one task.
- **The dashboard switches over:** once the recorder is live, `/api/bggcon/availability` reads
  the recorder's latest set rather than calling Tabletop.Events. That's a follow-up commit
  on #3's code.
- **Tests:** pytest for the change detection, covering:
  - first run;
  - no change;
  - copies going out and coming back;
  - an alert firing only on the move from all copies out to available, and only for starred
    games;
  - backoff.

  Tabletop.Events, BigQuery, GCS and ntfy are all mocked.
- **Verification:**
  - a manual run of the job writes a heartbeat;
  - a test push reaches Phil's phone;
  - **after the first day, compare the job's real cost on the bill with the estimate.**

## PR 5: the end-of-con report (after the con)

Dataform models on the raw events:
- per-copy out/in intervals;
- per-game demand by hour (checkouts, time out, time with every copy out);
- surges (hourly checkouts against the game's own baseline).

A report page or artifact on top. To be designed once there's data.

---

## Risks and unknowns

- **The con dates set the cut line.** If time runs short, ship through 3e, which covers the page
  and stars; 3f (the Explore switch and the Recommend pool) can follow.
- **Checked-out volume at peak** is unknown until the con. Raising the TTL is a one-constant
  change.
- **The Tabletop.Events API could change or rate-limit.** Stale fallbacks keep the page up.
  The page shows "as of"; it never shows a blank error.
- **The library id** (`0AEB11DA-…`) is the standing "bgg-events" library. Check it's still the
  one the 2026 page uses when the con opens.
- **Rollback:** PR 3 adds code only and changes nothing in the catalog artifact, the
  warehouse or Arrow columns. Reverting PR 2 removes the grant.

## Out of scope

- Other users and public access.
- SMS (phone push instead; spec §6).
- Catalog artifact changes.
- Moving the dev port.
