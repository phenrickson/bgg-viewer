# BGG.CON library: scope + availability page — design

**Date:** 2026-11-12
**Status:** Approved. Plan: `docs/superpowers/plans/2026-11-12-bggcon-library.md`.
Decided on 2026-11-12:
- The API caps pages at 100 (it silently drops to 25 above that), so a full pull is 86 calls.
- Stars and the snapshot go in GCS under `bggcon/`. That needs a write grant scoped to that
  folder, which is the plan's PR 2; bgg-viewer currently has read-only access.
- Review from the MacBook uses a dev-only server proxy for artifacts (plan PR 1).
**Branch:** `feat/bggcon-library` (one PR: spec, plan and implementation together)
**Lifetime:** Temporary. Built for BGG.CON 2026, then removed in one PR (see §7).

## Why

At BGG.CON, Phil wants to:

1. Use Explore and Recommend on **only the games in the con library**
   (<https://tabletop.events/conventions/bgg.con-2026/library>).
2. **Watch availability** for games he's interested in: star them, then check one page that
   shows which are on the shelf and which are checked out.

This is for Phil only to begin with (admin-gated, like the collection filter's Phase 1).

## The source: Tabletop.Events API (checked 2026-11-12)

The API is public: no login, no API key.

| Call | Use |
|---|---|
| `GET https://tabletop.events/api/library/0AEB11DA-2B7D-11EC-B400-855F800FD618/librarygames?_items_per_page=100&_page_number=N` | Full list: 8,545 rows, 86 pages of 100 |
| `…/librarygames?is_checked_out=1&_items_per_page=100` | Only checked-out copies. The API filters this on its side; it returned 7 rows outside the con |
| `GET https://tabletop.events/api/librarygame/{id}` | One copy (not needed) |

Results come back as `{ result: { items: [...], paging: { total_items, total_pages, next_page_number, … } } }`.

Fields we use from each row:

- `id`
- `bgg_id`: 99 of the first 100 rows had one
- `name`
- `is_checked_out`
- `is_in_circulation`
- `is_play_to_win`
- `custom_fields.ItemType`: "Standalone", or a value marking an expansion
- `checkout_count`

**Each row is one physical copy, not one game.** For example, `10-days-in-africa6` is a
numbered copy, and the first 100 rows held 97 distinct `bgg_id`s. So a game counts as
*available* when at least one of its in-circulation copies isn't checked out.

The id is for the standing "bgg-events" library, which the BGG.CON 2026 page shows. We
should check that it's still the same id once the con starts.

## Design

### 1. Server: the universe and availability, kept apart

Revised 2026-11-12 (Phil): the two are separate concerns and don't depend on each other.

- **The universe: which games are in the library, and how many copies.**
  - Built by a **daily GitHub Action** (`bggcon-library.yml`, cron at 10:00 UTC), which can
    also be run by hand when new games are added. The app never builds it.
  - The action makes a full pull: about 86 requests, one at a time, taking ~2 minutes. It
    keeps copies in circulation, keeps `ItemType` = standalone (compared case-insensitively),
    and groups by `bgg_id` into `{ bgg_id, name, copies, play_to_win }`.
  - Rows with no `bgg_id` are counted in the log line. An empty pull fails the run and leaves
    the last snapshot in place.
  - It's saved to `bggcon/library.json`. The app only reads it, re-checking every 30 min.
  - Daily is plenty. On 2026-11-12, no copies had been added in the previous 30 days. The
    library grows in batches before events: 775 copies in Sep 2026, 148 in May 2026, 421 in
    Nov 2025.
- **Availability: what's checked out right now.**
  - Fetched from the `is_checked_out=1` query alone and counted per `bgg_id`. It never reads
    the universe.
  - Held in memory with a **60 s** TTL and shared by every tab and device, so there's at most
    about one call a minute per instance, and only while someone is looking. Cloud Run
    throttles CPU between requests, so there's no background timer.
  - If Tabletop.Events is down or slow, it serves the last good value marked `stale`, with
    its time. The page shows "as of …" and never an error that blanks it.
- **The page combines them:** on the shelf = `copies − checked_out`. A game missing from the
  universe can still show "N checked out".

Routes, all admin-only:

- `GET /api/bggcon/library`: `{ builtAt, games: [{ bgg_id, name, copies, play_to_win }] }`.
  This is the scope.
- `GET /api/bggcon/availability`: `{ as_of, stale, checked_out: { [bgg_id]: n } }`. A game
  with nothing out is absent. `?ids=` limits it to those games.

### 2. Explore and Recommend: a "BGG.CON library" scope

This works like the owned-collection filter (`catalog.svelte.ts`, the `owned_collection`
table). It loads the library's `bgg_id`s into a `con_library` table in DuckDB, and the scope
filters by membership, so every existing view and tool narrows to the library. While the
scope is on, there's also an optional **available now** toggle, which uses the
availability route.

Library games that aren't in the catalog's working set don't appear in Explore. The
`/bggcon` page still lists them by their Tabletop.Events name.

### 3. Stars

- **Stored in** one small JSON file per user in the artifacts bucket
  (`bggcon/stars/{user_id}.json`, a list of `bgg_id`s). They sync between laptop and phone.
  We avoid BigQuery DML for a toggle that has to feel instant.
- **Routes:** `GET` and `PUT /api/bggcon/stars`. The client updates the star at once, then
  saves.
- **Star from:**
  - game cards and rows while the library scope is on;
  - game detail;
  - the `/bggcon` page's search.

### 4. The `/bggcon` page: a library dashboard in Explore's style

Agreed with Phil from a mockup on 2026-11-12
(https://claude.ai/artifact/A42RiTA4VvZXPBSQ37m45H).

- **Shell: Explore's own.** `Container` + `.workspace`, a 16rem sidebar beside the canvas. On a
  phone the sidebar goes into `RailSheet` behind a Filters button, exactly as on Explore.
- **Sidebar: Explore's `Rail`, unchanged,** applied to the library:
  - its "Name contains…" search (`.find` / `scope.q`);
  - complexity, players and play time visible;
  - categories, mechanics, families and people in its collapsed `RailGroup`s;
  - plus an **Available now** switch, built the same way as Rail's "My Collection" switch.
- **Header: counts in Explore's `.chead .count` style,** repeated: games in the library, on
  the shelf, checked out, and focus list (· N on the shelf), plus an "as of" time. No new tile
  component.
- **Show: `SegmentedControl` (md)** with *Focus list | Whole library*. A search always looks
  across the whole library, so a game can be found and starred from either view.
- **Rows: Recommend's list rows (`SimilarRow` with `onopen`).** Each row has:
  - a star (`Button` ghost `icon-sm` + lucide Star);
  - art and name, plus a complexity · players · time line;
  - the rating;
  - "N of M on shelf", in the status color **and** in words.
- **Click opens the game in place,** one at a time, like Recommend's "why". It shows:
  - availability (N of M copies, as of, play-to-win);
  - the info line, using `ResultSection`'s pieces;
  - **"Like this, in the library"**: `rankShelf(vectors, id, library ids)` as `SimilarRow`s,
    each with its own star and shelf status;
  - "Open game page →" as a link, not the default click.
- **The whole library is paged and sorted in DuckDB,** as `GameList` does. The checked-out
  counts load into a small table next to the library ids and refresh each minute, so
  "available first" and **Available now** apply to the whole set before paging. The focus
  list is one short list with no paging.
- **Refresh:** availability refetches every 60 s **only while the tab is visible**
  (`visibilitychange`), and once on refocus.
- **Library games that aren't in the catalog** still list by their Tabletop.Events name, with
  availability and a star, but they can't be filtered or recommended. The match rate is
  measured during the build and reported.
- Copy is Phil's. Placeholders are marked once in the source.

Colors follow `style-rules`. On the shelf and checked out use blue and orange status tokens,
and the words always carry the state too, so it never relies on color alone. The generic
`frontend-patterns` skill's TanStack `DataTable`, `Card.Kpi` and LayerChart patterns don't
apply; this repo has none of them.

### 5. Politeness budget

| What | How often | Requests |
|---|---|---|
| Universe (daily job) | once a day, plus manual runs | ~86 |
| Checked-out set | at most every 60 s, only while someone's looking | 1–5 (paged) |

If the checked-out set grows past a few pages at peak, the TTL goes up to 5 min. That's one
constant.

### 6. Out of scope

- Other attendees and public access.
- Push notifications when a game comes back.
- Checkout history, or popularity from `checkout_count`. That's an easy add later.
- Any change to the warehouse or the catalog artifact.

### 7. Removal after the con

All of it lives under `src/lib/bggcon/`, `src/lib/server/bggcon/`, `src/routes/(app)/bggcon/`
and `src/routes/api/bggcon/`. The scope hook and the star buttons are each one guarded call
site. Removing it is one PR: delete those folders and the call sites. The GCS objects can stay.

## Unknowns to settle in the plan

1. **Does `_items_per_page` go above 100?** If so, the snapshot takes fewer calls.
2. **What `ItemType` values exist?** We need them to filter expansions properly.
3. **The con dates.** The con is days away, so the plan should put the `/bggcon` page and
   stars first and treat the Explore scope as second priority.
4. **How large is the checked-out set at peak?** We'll only know at the con. It's the
   setting for the TTL.
