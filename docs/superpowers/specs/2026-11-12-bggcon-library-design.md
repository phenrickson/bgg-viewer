# BGG.CON library: scope + availability page — design

**Date:** 2026-11-12
**Status:** Draft, awaiting Phil's review. No plan yet.
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

### 1. Server: two cached reads, fetched only when asked for

Cloud Run throttles CPU when no request is running, so there's no background timer. Each
read refreshes only when a request finds its cache stale.

- **Library snapshot.** Pull all pages and keep rows where `is_in_circulation = 1`. Drop
  expansions by `ItemType`. Group by `bgg_id` into
  `{ bgg_id, name, copies, play_to_win_copies, copy_ids[] }`.
  - The snapshot is stored as one JSON object in the existing artifacts bucket, so a cold
    instance reads it rather than making 86 calls.
  - It refreshes when older than **6 h**, with one page at a time to be polite.
  - Rows with no `bgg_id` are dropped and counted in a log line.
- **Checked-out set.** Fetch the `is_checked_out=1` query (all its pages). Hold it in memory
  with a **60 s** TTL. All tabs and devices share it, so we make at most about one call per
  minute per instance, whoever is looking.
- A game is available when `copies − (checked-out copy ids that belong to it) > 0`.
- **If Tabletop.Events is down or slow,** serve the last good data with its timestamp. The
  page shows "as of …" and never an error that blanks it.

Routes, both admin-only:

- `GET /api/bggcon/library`: the grouped game list (ids, names, copies). This is the scope.
- `GET /api/bggcon/availability`: `{ as_of, games: { [bgg_id]: { available, copies } } }`.
  The page may pass `?ids=` to get only starred games back.

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

### 4. The `/bggcon` page (standalone, phone-first)

- One list of starred games, available ones first, then checked-out ones. Each row shows:
  - art and name;
  - "N of M copies";
  - a play-to-win badge.
- A search box over the library to add stars.
- An "Updated Ns ago" line. The page refetches availability every 60 s **only while the tab
  is visible** (`visibilitychange`) and once on refocus.
- It can be added to the home screen. It should work as a page of its own, with no need to
  go through Explore.
- Copy is Phil's. Placeholders are marked once in the source.

**Components (checked against the repo on 2026-11-12). Compose these; no new styles.**

| Need | Existing component |
|---|---|
| A starred game's card | `$lib/catalog/GameCard.svelte`, the shared shell with `art`, `identity` and stat snippets. Availability ("N of M") goes in a stat cell. |
| A row in a wide layout | `$lib/discover/GameRow.svelte`, if its `DiscoverGame` shape fits a catalog game. Otherwise use GameCard alone; don't fork the row. |
| Play-to-win marker | `$lib/components/ui/badge` |
| Star toggle, refresh | `$lib/components/ui/button`. The star is a Button variant, not a new control. |
| Available / All switch | `$lib/components/ui/segmented-control` |
| Page layout | `Stack` / `AutoGrid` from `$lib/components/ui/layout` |
| Explore's scope chip | the existing `FilterChips.svelte` / rail patterns, the way the collection filter shows up |

The generic `frontend-patterns` skill's TanStack `DataTable`, `Card.Kpi` and LayerChart
patterns don't apply. This repo has none of them, and this page doesn't need any.
Colors follow `style-rules`: available and checked-out use the semantic status tokens and
never color alone, so the "N of M" text carries the state too.

### 5. Politeness budget

| What | How often | Requests |
|---|---|---|
| Full snapshot | at most every 6 h | ~86 |
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
