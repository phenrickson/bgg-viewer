# BGG.CON library analytics: design

Agreed with Phil 2026-11-17. Builds on the BGG.CON library spec
(`2026-11-12-bggcon-library-design.md`, §8 Recorder). Mockup:
https://claude.ai/artifact/WWpLVTwZd38XeaQMYb5zgf (made-up numbers; layout and chart forms are
the agreed design).

## Why

Phil wants to watch the con library's activity **during the con** (Wed 18 to Sun 22 Nov 2026),
and the charts are the **start of the end-of-con report** (spec §8). "Not crazy details":
each view is one clear chart, and charts replace tables.

## Where

- Two routes: **`/bggcon`** (the library and availability, as today) and
  **`/bggcon/analytics`** (this page), with a small switcher between them at the top of both.
- Open to the same signed-in users as `/bggcon`, behind the same gate (Phil, 2026-11-17).

## Library hours

Phil, 2026-11-17: plan on last year's hours (2026's aren't posted; 2024 and 2025 were the same),
Chicago time:

| Day | Open | Close |
|---|---|---|
| Wed 18 | 9 AM | midnight |
| Thu 19 – Sat 21 | 8 AM | midnight |
| Sun 22 | 8 AM | 1 PM |

- Tue 17 is the recorder's test day, not library hours.
- Games finished after closing are dropped at the hotel front desk and checked in the next
  morning, so a burst of `in` events at opening is overnight drop-offs.
- Kept in one place (a small config the API reads), so a change if 2026 posts different hours
  is one edit.

## What the page shows

Top to bottom, as in the mockup.

1. **Summary numbers:** checkouts so far, checkouts in the last hour, busiest hour so far,
   different games checked out.
2. **Over the con:** checkouts every **15 minutes**, Tue 00:00 to Sun 1 PM, the whole range
   always drawn: closed hours shaded, a "now" line, empty space for what's to come, and the
   current 15 minutes drawn faded as still counting.
3. Three charts in a row:
   - **By time of day:** bars, average checkouts per hour across the con days (Wed on), complete
     hours only;
   - **Each day:** one line per con day across the hours of the library day; color follows the
     day (fixed order), today's line thicker with a "so far" end dot; complete hours only;
   - **By day:** vertical bars, total checkouts per day; today faded, days to come outlined.
4. **Games**, top 10 each, 2×2:
   - **Most checked out:** horizontal bars;
   - **Most in demand:** horizontal bars on a **fixed 0–100%** scale: share of open minutes
     with every copy out; each game's copy count beside its name;
   - **Gaining steam:** dumbbell: checkouts in the 3 h before (hollow) and the last 3 h
     (filled), ranked by the rise;
   - **Kept out longest:** dot for the median time out per checkout, with a band for the
     middle half (quartiles).

Dropped (Phil): player-count and playing-time breakdowns.

## Goals, non-goals, anti-goals

- Goal: live during the con, from its first day.
- Non-goals: filters, drill-downs, per-copy detail, exports; the Dataform models from spec §8.
- Anti-goal: **the recorder does more than record** (Phil). It stays as it is.

## Approaches

- **A. Two new endpoints on the warehouse read API** (`bgg-data-warehouse/services/warehouse_api`),
  read by the viewer's server through its existing warehouse client. **Picked** (Phil): the
  API's deploy, auth and client exist; the page holds no SQL; the recorder is untouched.
- B. The recorder writes a summary file. **Rejected** (Phil): the recorder's job is to record.
- C. Dataform models first. Deferred: slower, not needed for small tables.

## Data

- `raw.bggcon_checkout_events (copy_id, bgg_id, name, event, observed_at, lastcheckout_id, …)`:
  - **dedupe:** two overlapping recorder runs can insert the same event; keep one row per
    `(copy_id, event, lastcheckout_id)` at its earliest `observed_at`;
  - **window:** from Tue 17 Nov 00:00 Chicago; earlier rows (the 13 Nov trial) are ignored;
  - **the first run's baseline isn't checkouts:** the recorder's first run wrote an `out` for
    every copy already out; those set the starting state but don't count as checkouts (they are
    the events at the window's earliest `observed_at`);
  - game name comes from the events' `name`; no join to other warehouse tables is needed.
- `raw.bggcon_runs (observed_at, n_out, ok)`: one row per recorder minute; the latest run is
  "now" for the API.
- **Copies per game:** `bggcon/library.json` in the viewer bucket (built daily by the viewer).
  The API's service account gets read access to that object (Terraform, via Actions). The bucket
  deletes `bggcon/` objects after 30 days; whether to keep the file longer is a post-con
  decision, not part of this work.

## Warehouse API (bgg-data-warehouse)

A `bggcon` router behind the API's existing auth; results cached about a minute.

- **`GET /bggcon/activity`** → `as_of` (latest run), and checkouts per 15-minute bucket since
  Tue 00:00 Chicago. The page derives every activity view and the first three summary numbers
  from this one list, so they agree with each other.
- **`GET /bggcon/games`** → `as_of`, and per BGG id: `name`, `copies`,
  - `checkouts`;
  - `checkouts_last_3h`, `checkouts_prev_3h`, measured back from `as_of`;
  - `minutes_all_out` and `open_minutes`: a running count of copies out per game (from the
    events, starting at the baseline), summed over the stretches where it's ≥ `copies`, only
    within library hours; `open_minutes` = library-hours minutes from Wed 9 AM to `as_of`;
  - `time_out_median`, `time_out_q1`, `time_out_q3` (minutes): each `out` matched to its `in`
    by `copy_id` and `lastcheckout_id`; copies still out are left out; **an `in` seen in the
    first hour after opening is an overnight drop-off and stops the clock at the previous
    close** (Phil, 2026-11-17).
  - Copies without a BGG id are left out of the games list.

## Viewer (bgg-viewer)

- `src/routes/(app)/bggcon/analytics/`: server `load` calls the two endpoints through
  `warehouseClient()`; the page derives the activity views client-side.
- Follows the `frontend-patterns` skill: layout primitives, `Card`, `Card.Kpi`, LayerChart, chart
  tokens; reuses existing components (the switcher is the existing `SegmentedControl`).
- Refreshes on load; no polling.

## Left to the builder

- Exact SQL, caching, and response field names.
- Chart details within the mockup's forms (tick spacing, tooltip wording).
- Copy on the page: Phil writes it; placeholders flagged in the source.
- Delivery: one branch + PR per repo. Warehouse first (deploys on merge), then the viewer
  (released via release-please).
