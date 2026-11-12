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

There are three PRs, in two repos, merged in the order below. Phil merges every PR.
Development never happens on `main`. Each tested step is committed and pushed as it's done.

| # | Repo | Branch | Depends on |
|---|---|---|---|
| 1 | bgg-viewer | `feat/dev-lan-artifacts` (from `main`) | nothing |
| 2 | bgg-data-warehouse | `feat/terraform-bggcon-writer` (from `main`) | nothing |
| 3 | bgg-viewer | `feat/bggcon-library` (exists; holds the spec and this plan) | #2 deployed for prod; #1 for MacBook review |

PRs 1 and 2 are independent and can go up in parallel.

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

- `src/lib/server/bggcon/store.ts` reads and writes `bggcon/library.json` and
  `bggcon/stars/{user_id}.json` through the same `Storage` client (`CATALOG_BUCKET`).
- `src/lib/server/bggcon/library.ts` holds the library in memory, falls back to the GCS
  snapshot, and rebuilds from Tabletop.Events when the snapshot is older than 6 h. Only one
  rebuild runs at a time (an in-flight promise, like `artifact-cache.ts`). If the rebuild
  fails, it keeps serving the old snapshot.
- `src/lib/server/bggcon/checked-out.ts` caches the checked-out set in memory with a 60 s TTL
  and the same in-flight guard. If the upstream call fails, it serves the last value with its
  `as_of` time.
- Routes, all `isAdmin`-gated (401 signed out, 403 for non-admins):
  - `GET /api/bggcon/library`
  - `GET /api/bggcon/availability` (optional `?ids=`)
  - `GET` and `PUT /api/bggcon/stars`
- **Tests:**
  - TTL and in-flight behavior with an injected clock, as in `cache.test.ts`;
  - the stale fallback;
  - the auth matrix on each route;
  - the stars `PUT` checks its body (an array of positive ints with a sane max length).

### 3c. The `/bggcon` page and stars

- `src/routes/(app)/bggcon/+page.server.ts` is admin-gated and returns breadcrumbs and a
  subtitle (placeholder copy, flagged once).
- `src/routes/(app)/bggcon/+page.svelte`:
  - Starred games sorted with available first, each shown as a `GameCard` (art, name, and an
    "N of M" stat) and a play-to-win `Badge`.
  - A `SegmentedControl` for Available / All.
  - A search box over the library, with a star `Button` on each result.
  - The page refetches every 60 s while the tab is visible (`visibilitychange`) and right
    away on refocus. It shows when the data was last updated.
- `src/lib/bggcon/stars.svelte.ts` is the one client store for stars. It updates
  optimistically and `PUT`s the change; if the `PUT` fails, it reverts and says so. The page
  and every other star button use it.
- Art and names come from the catalog when the game is in it. Otherwise the name comes from
  Tabletop.Events and the art is a placeholder.
- **Verification:**
  - `just check`;
  - Phil reviews it on his dev server, in light and dark, and on the MacBook through PR 1;
  - a narrow phone-width check of the layout.

### 3d. Library filter in Explore and the map

- `catalog.svelte.ts`: a `con_library` table and an `applyConLibrary(ids)` /
  `clearConLibrary()` pair, mirroring `applyCollectionFilter`. `appendCollectionFilter` also
  ANDs `game_id IN (SELECT game_id FROM con_library)` when it's active. That one function
  feeds Explore and the map, so no call site changes.
- `Rail.svelte`: an admin-only toggle next to "My collection", built the same way, with a
  chip through `FilterChips`' external-chip slot.
- An "available now" sub-toggle narrows `con_library` to available ids from the availability
  route.
- A star button on `GameCard` and `GameRow` only while the library filter is on, through the
  shared stars store.
- **Tests:** Vitest for the where clause with the collection filter, the library filter and
  both together.

### 3e. Library pool in Recommend

- `sources.ts`: add `'library'` to `POOLS`, admin-only in the picker.
- `+page.svelte`: the `library` pool calls the existing `rankShelf(vectors, id, libraryIds, n)`,
  passing the library's ids as the set.
- **Tests:** a `rankShelf` test with a library-sized id set; the existing tests stay green.

### PR 3 wrap-up

- `just verify`.
- A PR description that lists the removal steps (spec §7), so cleaning up after the con is
  mechanical.

---

## Risks and unknowns

- **The con dates set the cut line.** If time runs short, ship 3a–3c, which covers the page
  and stars. 3d and 3e can follow, or be dropped.
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
- Push alerts.
- Popularity and checkout history.
- Warehouse or catalog artifact changes.
- Moving the dev port.
