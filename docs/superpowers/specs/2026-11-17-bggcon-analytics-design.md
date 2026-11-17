# BGG.CON library analytics: design

Agreed with Phil 2026-11-17. Builds on the BGG.CON library spec
(`2026-11-12-bggcon-library-design.md`, §8 Recorder).

## Why

Phil wants to watch the con library's activity **during the con** (Wed 18 to Sun 22 Nov 2026),
and the charts are the **start of the end-of-con report** (spec §8). It is for Phil alone. "Not
crazy details": each view is one clear chart or ranked list.

## What it shows

1. **Activity over time.** Copies out across the con, and checkouts per hour. The point is to
   see the con's shape: when people arrive, when the library is busiest, when it's closed.
2. **Most checked out.** Games ranked by number of checkouts.
3. **Most in demand.** Games with the least availability: ranked by the **share of recorded
   minutes with every copy out** (my call). The game's number of copies shows beside it, so a
   one-copy game that's always gone reads differently from a six-copy one.
4. **Gaining steam.** Checkouts in the **last 3 hours against the 3 before**, ranked by the
   increase (my call on the window).
5. **What kinds of games are popular.** Checkouts broken down by **player count** and by
   **playing time**. Weight, category and mechanic can follow later; not in this pass.

## Goals, non-goals, anti-goals

- Goal: useful from the con's first day; ship in slices (below).
- Non-goal: filters, drill-downs, per-copy detail, exports. The report polishes later.
- Non-goal: the Dataform models from spec §8 (per-copy intervals, demand by hour). They can
  come after the con if the report needs them.
- Anti-goal: **the recorder does more than record.** It stays as it is; no summaries, no
  report logic in it (Phil, 2026-11-17).
- Anti-goal: anyone but Phil sees it.

## Approaches

- **A. New endpoints on the warehouse read API** (`bgg-data-warehouse/services/warehouse_api`),
  read by an admin page in the viewer through its existing warehouse client. **Picked** (Phil):
  the API's deploy, IAM gate and viewer client already exist; it reads BigQuery so the page
  doesn't hold SQL; it isn't tied to the recorder or to /bggcon's removal.
- B. The recorder writes a summary file every few minutes. **Rejected** (Phil): the recorder's
  job is to record.
- C. Dataform models first, API on top. Deferred: slower, not needed for a small event table.

## Design

### Data (all already recorded)

- `raw.bggcon_checkout_events (copy_id, bgg_id, name, event, observed_at, lastcheckout_id,
  tte_checkout_date)`: one row per copy going `out` or coming back `in`, since Tue 17 Nov 00:00
  Chicago. A run that lost the race to save state can insert duplicates; dedupe on
  `(copy_id, event, lastcheckout_id)`.
- `raw.bggcon_runs (observed_at, n_out, ok, note)`: one row per minute; `n_out` is copies out.
  `note = 'test run'` rows are excluded.
- Copy counts per game: `bggcon/library.json` in the viewer bucket (built daily by the viewer).
- Game name, player count and playing time: the warehouse's own game tables, joined in the
  API's query (my call). The viewer's catalog only joins in the browser (DuckDB, as /bggcon
  does); joining in the API keeps the page server-rendered and free of /bggcon code, so it
  survives §7's removal.
- Events and totals here use the full event log from Tue 17 Nov 00:00 Chicago, independent of
  the recorder's `COUNT_FROM` (which only governs the dashboard's running total). Earlier
  rows (the 13 Nov trial and manual test runs) are outside that window and ignored.
- **The first run's baseline is not checkouts** (my call). The recorder's first run wrote an
  `out` event for every copy already out; those are the replay's starting state but are left
  out of checkout counts, so the first hour shows no false spike. They're the events at the
  earliest `observed_at` in the window.
- **Copy counts are kept past the con** (my call). `library.json` is deleted with /bggcon's
  code and by the bucket's 30-day rule, so after the con its counts are loaded once into a
  small BigQuery table (`raw.bggcon_library`: bgg_id, name, copies), and the API reads that
  table when it exists. During the con the API reads `library.json`'s current counts; a copy
  added mid-con counts from then on as if it had always been there (accepted).

### Warehouse API (bgg-data-warehouse)

A `bggcon` router, behind the API's existing auth, two GETs:

- `GET /bggcon/activity` → per hour (Chicago time): average and max copies out (from runs),
  checkouts (`out` events), and whether every minute of the hour was recorded.
- `GET /bggcon/games` → per BGG id: `name`, player count and playing time, `checkouts`,
  `checkouts_last_3h`, `checkouts_prev_3h`, `minutes_all_out`, `minutes_recorded`, `copies`.
  The 3-hour windows end at the latest recorded run, not the clock, so after the con they
  show the con's last hours (my call).
  - `minutes_all_out`: replay events to each game's copies-out count over time, and count the
    recorded minutes where it equals `copies`. `copies` comes from `library.json`; the API's
    service account gets read access to that one object's bucket (Terraform, via Actions).
  - Copies without a BGG id are left out of game rankings and counted in one total.

Both are one BigQuery query over small tables; results cached in the API for a minute or two.

### Viewer (bgg-viewer)

- `/admin/bggcon`, a new section in the admin sub-nav. Admin-only (the admin layout's 404 gate).
  It outlives /bggcon's removal (spec §7) and becomes the report's starting point.
- Server `load` calls the two endpoints through `warehouseClient()`; everything it shows
  comes from them.
- Charts follow the repo's chart conventions (`data-visualization` / `style-rules` skills);
  rankings reuse existing list/row components.
- Refreshes on load (a manual reload is fine; no polling).

### Slices

1. Activity over time, most checked out, gaining steam, player count / playing time.
2. Most in demand (the replay is the slowest piece).

## Left to the builder

- Exact chart types, the player-count and playing-time buckets, and how many games each
  ranking shows.
- Query shape and caching details in the API.
- Delivery: one branch + PR per repo; warehouse deploys on merge, viewer via release-please.
