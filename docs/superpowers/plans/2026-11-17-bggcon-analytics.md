# BGG.CON Library Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/bggcon/analytics` page showing the con library's activity and top games, fed by two
new endpoints on the warehouse read API.

**Architecture:** The warehouse API reads the recorder's events with one plain query, and pure
Python functions (`src/bggcon/analytics.py`) turn them into 15-minute activity buckets and
per-game stats. The viewer's server `load` fetches both endpoints through the existing warehouse
client; pure TypeScript functions derive the per-hour/per-day views; LayerChart draws them.

**Tech Stack:** Python 3.12, FastAPI, google-cloud-bigquery/storage, pytest (warehouse);
SvelteKit 2 / Svelte 5, LayerChart 2, vitest (viewer).

**Spec:** `docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md` (bgg-viewer). Mockup:
<https://claude.ai/artifact/WWpLVTwZd38XeaQMYb5zgf>.

## Delivery

- **bgg-data-warehouse:** branch `feat/bggcon-analytics-api` from `origin/main`; Tasks 1–2;
  one PR. Merging deploys the API (`deploy-warehouse-api.yml`). Phil merges.
- **bgg-viewer:** branch `feat/bggcon-analytics` (already holds the spec and this plan);
  Tasks 3–6; one PR. Ships via release-please (Phil). Merge the warehouse PR first.
- Commit and push after each task. `gh pr view --json state,mergedAt` before every push.
- Conventional commits, scoped `(bggcon)`.

## Global Constraints

- Times: all API timestamps are UTC ISO 8601; the viewer shows **America/Chicago** (CST, UTC−6
  all con week; no DST change).
- Library hours (Chicago): **Wed 18 9 AM–midnight; Thu 19–Sat 21 8 AM–midnight; Sun 22
  8 AM–1 PM.** Defined once, in `src/bggcon/analytics.py`, and sent to the viewer in the
  activity response.
- Window: events from **Tue 17 Nov 00:00 Chicago** (`recorder.WINDOW_START`); the
  over-the-con chart ends **Sun 22 Nov 1 PM**.
- The recorder (`src/pipeline/bggcon_recorder.py`, `src/bggcon/recorder.py`) is **not changed**.
- Copies per game come from `bggcon/library.json` in bucket
  `bgg-data-warehouse-bgg-viewer-artifacts` (`{"games": [{"bgg_id", "copies", …}]}`). The API's
  service account (`bgg-data-warehouse@`) already has project-wide object read; no Terraform.
- Page access: same as `/bggcon`, any signed-in user (`requireUser`).
- Copy on the page is Phil's: mark placeholder text `// PLACEHOLDER copy (Phil)` once per file.
- Viewer UI follows the `frontend-patterns` skill: `Container`/`Stack`/`AutoGrid` from
  `$lib/components/ui/layout`, `Card`, LayerChart, `var(--chart-N)` tokens, both themes.

## Review Focus

1. **A signed-out request to `/bggcon/analytics`** must not reach the warehouse: the `(app)`
   layout guard runs in parallel with page loads, so the page's own `load` calls `requireUser`
   (Task 5 test).
2. **Warehouse down or `WAREHOUSE_API_URL` unset:** the page shows a message, not a 500
   (Task 5 test, same pattern as `/admin/pipeline`).
3. **No data yet** (no runs, no events): both endpoints return empty lists and `as_of: null`;
   the page shows empty states, not errors (Task 1 tests; Task 5 renders).
4. **A game missing from `library.json`, or `library.json` missing:** that game's
   `copies`/`minutes_all_out` are `null` and it's left out of "most in demand"; nothing 500s
   (Task 1 and Task 2 tests).
5. **An `in` with no matching `out`** (the copy went out before the window), and **duplicate
   events** from overlapping recorder runs: no negative copy counts, no double counting
   (Task 1 tests).

---

### Task 1: Pure analytics (warehouse)

**Files:**
- Create: `src/bggcon/analytics.py`
- Test: `tests/test_bggcon_analytics.py`

**Interfaces:**
- Consumes: `src.bggcon.recorder.WINDOW_START`, `CON_OPEN` (unchanged).
- Produces:
  - `LIBRARY_HOURS: list[tuple[datetime, datetime]]` (UTC open/close):
    Wed `(2026-11-18 15:00, 2026-11-19 06:00)`, Thu `(11-19 14:00, 11-20 06:00)`,
    Fri `(11-20 14:00, 11-21 06:00)`, Sat `(11-21 14:00, 11-22 06:00)`,
    Sun `(11-22 14:00, 11-22 19:00)`.
  - Event dicts: `{"copy_id": str, "bgg_id": int | None, "name": str | None, "event": "out" | "in",
    "observed_at": datetime (UTC), "lastcheckout_id": str | None}`.
  - `dedupe(events: list[dict]) -> list[dict]`: one per `(copy_id, event, lastcheckout_id)`,
    the earliest `observed_at`; sorted by `observed_at`.
  - `activity(events: list[dict], as_of: datetime | None) -> dict` →
    `{"as_of": iso | None, "hours": [{"open": iso, "close": iso}], "buckets": [{"start": iso,
    "checkouts": int}]}`; buckets every 15 min from `WINDOW_START` through the bucket holding
    `as_of` (none when `as_of` is None).
  - `games(events: list[dict], as_of: datetime | None, copies: dict[int, int]) -> dict` →
    `{"as_of": iso | None, "games": [row]}`, row =
    `{"bgg_id", "name", "copies": int | None, "checkouts", "checkouts_last_3h",
    "checkouts_prev_3h", "minutes_all_out": int | None, "open_minutes": int,
    "time_out_median": int | None, "time_out_q1": int | None, "time_out_q3": int | None}`;
    one row per BGG id seen in the events; sorted by `checkouts` desc.
  - Both call `dedupe` themselves. "Baseline" = events at the earliest `observed_at`; they are
    never checkouts and never durations, but they do start the copies-out count.

- [ ] **Step 1: Write the failing tests**

Helpers: `ev(copy, bgg, event, t, last="co-1", name="Catan")`; `T = CON_OPEN` (Wed 15:00 UTC);
`BASE = WINDOW_START`.

```python
def test_dedupe_keeps_the_earliest_of_a_duplicate():
    a = ev("c1", 13, "out", T + timedelta(minutes=5)); b = ev("c1", 13, "out", T + timedelta(minutes=6))
    assert dedupe([b, a]) == [a]

def test_activity_counts_outs_per_15_minutes_and_skips_the_baseline():
    events = [ev("c0", 7, "out", BASE),                               # baseline
              ev("c1", 13, "out", T + timedelta(minutes=1)),
              ev("c2", 13, "out", T + timedelta(minutes=14)),
              ev("c1", 13, "in", T + timedelta(minutes=20))]
    a = activity(events, as_of=T + timedelta(minutes=20))
    by = {b["start"]: b["checkouts"] for b in a["buckets"]}
    assert by[T.isoformat()] == 2 and by[(T + timedelta(minutes=15)).isoformat()] == 0
    assert a["buckets"][0]["start"] == BASE.isoformat() and sum(by.values()) == 2
    assert a["buckets"][-1]["start"] == (T + timedelta(minutes=15)).isoformat()
    assert len(a["hours"]) == 5 and a["hours"][0] == {"open": T.isoformat(), "close": "2026-11-19T06:00:00+00:00"}

def test_no_data_is_empty_not_an_error():
    assert activity([], None)["buckets"] == [] and activity([], None)["as_of"] is None
    assert games([], None, {}) == {"as_of": None, "games": []}

def test_games_counts_checkouts_and_the_two_3h_windows():
    now = T + timedelta(hours=6)
    events = [ev("c0", 13, "out", BASE),
              ev("c1", 13, "out", now - timedelta(hours=1)), ev("c2", 13, "out", now - timedelta(hours=2), last="co-2"),
              ev("c3", 13, "out", now - timedelta(hours=4), last="co-3")]
    [g] = games(events, now, {13: 5})["games"]
    assert (g["checkouts"], g["checkouts_last_3h"], g["checkouts_prev_3h"]) == (3, 2, 1)

def test_minutes_all_out_counts_only_library_hours_and_open_minutes_run_from_wed_9am():
    # 1 copy; out 23:00–01:00 Chicago (05:00–07:00 UTC Thu): only the hour to midnight counts.
    out_t = datetime(2026, 11, 19, 5, 0, tzinfo=UTC); in_t = datetime(2026, 11, 19, 7, 0, tzinfo=UTC)
    events = [ev("c0", 99, "out", BASE), ev("c1", 13, "out", out_t), ev("c1", 13, "in", in_t)]
    [g] = [r for r in games(events, in_t, {13: 1})["games"] if r["bgg_id"] == 13]
    assert g["minutes_all_out"] == 60 and g["open_minutes"] == 15 * 60

def test_an_in_without_an_out_never_goes_below_zero_copies_out():
    events = [ev("c0", 99, "out", BASE), ev("cX", 13, "in", T + timedelta(hours=1), last="old"),
              ev("c1", 13, "out", T + timedelta(hours=2)), ev("c1", 13, "in", T + timedelta(hours=3))]
    [g] = [r for r in games(events, T + timedelta(hours=4), {13: 1})["games"] if r["bgg_id"] == 13]
    assert g["minutes_all_out"] == 60

def test_time_out_quartiles_and_the_overnight_drop_off():
    # Two checkouts of 30 and 90 min; one dropped overnight: out 23:00 Wed, in 8:20 Thu (Chicago)
    # → stops at midnight = 60 min.
    events = [ev("c0", 99, "out", BASE),
              ev("a", 13, "out", T, last="1"), ev("a", 13, "in", T + timedelta(minutes=30), last="1"),
              ev("b", 13, "out", T, last="2"), ev("b", 13, "in", T + timedelta(minutes=90), last="2"),
              ev("c", 13, "out", datetime(2026, 11, 19, 5, 0, tzinfo=UTC), last="3"),
              ev("c", 13, "in", datetime(2026, 11, 19, 14, 20, tzinfo=UTC), last="3")]
    [g] = [r for r in games(events, datetime(2026, 11, 19, 15, 0, tzinfo=UTC), {13: 3})["games"] if r["bgg_id"] == 13]
    assert (g["time_out_q1"], g["time_out_median"], g["time_out_q3"]) == (45, 60, 75)

def test_a_game_missing_from_the_library_has_no_copies_or_demand():
    events = [ev("c0", 99, "out", BASE), ev("c1", 13, "out", T + timedelta(hours=1))]
    [g] = [r for r in games(events, T + timedelta(hours=2), {})["games"] if r["bgg_id"] == 13]
    assert g["copies"] is None and g["minutes_all_out"] is None

def test_copies_without_a_bgg_id_are_left_out():
    events = [ev("c0", 99, "out", BASE), ev("c1", None, "out", T)]
    assert [r["bgg_id"] for r in games(events, T + timedelta(hours=1), {})["games"]] == [99]
```

- [ ] **Step 2: Run them to see them fail**

Run: `uv run pytest tests/test_bggcon_analytics.py -q`
Expected: FAIL (`ModuleNotFoundError: src.bggcon.analytics`).

- [ ] **Step 3: Implement `src/bggcon/analytics.py`**

Pure functions only (no network, no clock), as in `recorder.py`. The two parts the signatures
don't determine:

- **Copies out over time (`minutes_all_out`):** per game, walk its events in time order with a
  running count (`out` +1, `in` −1, floored at 0, starting from the baseline). Each stretch where
  count ≥ `copies` is intersected with every `LIBRARY_HOURS` window clipped to `[CON_OPEN, as_of]`;
  sum the minutes. `open_minutes` is the same intersection for the whole span `[CON_OPEN, as_of]`.
- **Time out:** pair `out`/`in` by `(copy_id, lastcheckout_id)`, skipping baseline outs and
  unpaired events. If the `in` falls in the first 60 minutes after a `LIBRARY_HOURS` open and
  the `out` is before that open, the end is the previous window's close. Quartiles with
  `statistics.quantiles(minutes, n=4, method="inclusive")`; one value → all three equal it;
  round to int.

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_bggcon_analytics.py -q` → all pass. Then `uv run ruff check
src/bggcon/analytics.py tests/test_bggcon_analytics.py` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/bggcon/analytics.py tests/test_bggcon_analytics.py
git commit -m "feat(bggcon): library analytics from the recorder's events"
```

### Task 2: Reader, router and deploy trigger (warehouse)

**Files:**
- Create: `src/warehouse/readers/bggcon.py`, `services/warehouse_api/routers/bggcon.py`
- Modify: `services/warehouse_api/main.py` (include the router),
  `.github/workflows/deploy-warehouse-api.yml` (add `'src/bggcon/**'` to `paths`)
- Test: `tests/test_bggcon_router.py`

**Interfaces:**
- Consumes: Task 1's `activity`, `games`.
- Produces:
  - Reader: `fetch_events(client=None) -> list[dict]` (event dicts from
    `raw.bggcon_checkout_events` where `observed_at >= WINDOW_START`; columns `copy_id, bgg_id,
    name, event, observed_at, lastcheckout_id`); `fetch_as_of(client=None) -> datetime | None`
    (`MAX(observed_at)` from `raw.bggcon_runs` where `ok` and `note` is not `'test run'`);
    `fetch_copies() -> dict[int, int]` (from `library.json`; `{}` when the file is missing).
  - Routes: `GET /bggcon/activity` → Task 1 `activity(...)`; `GET /bggcon/games` → Task 1
    `games(...)`. Cached 60 s in-process; `_reset_cache()` test seam (as in `routers/monitoring.py`).

- [ ] **Step 1: Write the failing router tests** (reader monkeypatched, as in
  `tests/test_monitoring_router.py`)

```python
def test_activity_returns_the_buckets(monkeypatch):  # fake 1 baseline + 1 out at CON_OPEN; as_of CON_OPEN+5min
    r = client.get("/bggcon/activity")
    assert r.status_code == 200 and r.json()["as_of"] == (CON_OPEN + timedelta(minutes=5)).isoformat()
    assert r.json()["buckets"][-1] == {"start": CON_OPEN.isoformat(), "checkouts": 1}

def test_games_uses_the_library_copies(monkeypatch):  # fetch_copies → {13: 2}
    assert client.get("/bggcon/games").json()["games"][0]["copies"] == 2

def test_games_without_a_library_file_still_answers(monkeypatch):  # fetch_copies → {}
    r = client.get("/bggcon/games")
    assert r.status_code == 200 and r.json()["games"][0]["copies"] is None

def test_results_are_cached_for_a_minute(monkeypatch):  # count fetch_events calls: 2 GETs → 1 call
    ...
```

- [ ] **Step 2: Run them to see them fail**

Run: `uv run pytest tests/test_bggcon_router.py -q` → FAIL (404s).

- [ ] **Step 3: Implement the reader, the router, the `main.py` include and the workflow path**

Reader SQL is a plain `SELECT` with an `@start` timestamp parameter (pattern:
`src/warehouse/readers/monitoring.py`); `fetch_copies` uses `google.cloud.storage`, bucket from
`BGGCON_BUCKET` env (default `bgg-data-warehouse-bgg-viewer-artifacts`), `NotFound` → `{}`.

- [ ] **Step 4: Run the tests and a dry run of the reader query**

Run: `uv run pytest tests/test_bggcon_router.py tests/test_bggcon_analytics.py -q` → pass.
Run once against BigQuery: `uv run python -c "from src.warehouse.readers import bggcon as b;
print(len(b.fetch_events()), b.fetch_as_of(), len(b.fetch_copies()))"` → three values, no error.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add src/warehouse/readers/bggcon.py services/warehouse_api/routers/bggcon.py services/warehouse_api/main.py .github/workflows/deploy-warehouse-api.yml tests/test_bggcon_router.py
git commit -m "feat(bggcon): /bggcon/activity and /bggcon/games on the warehouse API"
git push -u origin feat/bggcon-analytics-api
gh pr create --title "feat(bggcon): library analytics endpoints" --body "…"
```

### Task 3: Warehouse client methods (viewer)

**Files:**
- Modify: `src/lib/server/warehouse/types.ts`, `src/lib/server/warehouse/client.ts`,
  `src/lib/server/warehouse/index.ts` (export the types)
- Test: `src/lib/server/warehouse/client.test.ts`

**Interfaces:**
- Consumes: Task 2's JSON.
- Produces: types `BggconActivity { as_of: string | null; hours: { open: string; close: string }[];
  buckets: { start: string; checkouts: number }[] }`, `BggconGame` (Task 1 row, same snake_case
  names), `BggconGames { as_of: string | null; games: BggconGame[] }`; client methods
  `getBggconActivity(): Promise<BggconActivity>` and `getBggconGames(): Promise<BggconGames>`.

- [ ] **Step 1: Failing tests** (`stubFetch` as in the file): each method GETs its path on the
  configured base with the Bearer token and returns the parsed JSON; a 500 throws `WarehouseError`
  whose message includes the API's `detail`.
- [ ] **Step 2: Run** `npx vitest run src/lib/server/warehouse/client.test.ts` → FAIL.
- [ ] **Step 3: Implement** both methods with `authedGet` + `failure`, like `getLineage`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(bggcon): warehouse client for library analytics`.

### Task 4: Derived activity views (viewer)

**Files:**
- Create: `src/lib/bggcon/analytics.ts`
- Test: `src/lib/bggcon/analytics.test.ts`

**Interfaces:**
- Consumes: `BggconActivity` (Task 3).
- Produces (all times shown in America/Chicago; "complete" = ends at or before `as_of`):
  - `chicago(iso: string): { day: string; date: number; hour: number; minute: number }`
    (`day` = `'Tue'`…`'Sun'`).
  - `kpis(a: BggconActivity): { total: number; lastHour: number; busiest: { day: string; hour: number } | null }`
    (`lastHour` = buckets starting in the 60 min before `as_of`; `busiest` over complete hours).
  - `byDay(a): { day: string; checkouts: number | null; partial: boolean }[]`, Tue–Sun, `null`
    for days not reached, `partial` for `as_of`'s day.
  - `averageByHour(a): { hour: number; average: number }[]`, hours 8–23, mean over library days
    (Wed–Sun) that have that hour complete and open.
  - `eachDay(a): { day: string; points: { hour: number; checkouts: number }[] }[]`, Wed–Sun,
    hours 8–23, complete open hours only.
  - `isOpen(a, iso): boolean` (inside an `a.hours` window), for shading.

- [ ] **Step 1: Failing tests** with a hand-built `BggconActivity` (Wed 9:00–11:00 Chicago, a
  few buckets, `as_of` Wed 10:20): `kpis` total and `lastHour`; `byDay` gives Wed partial and
  Thu–Sun `null`; `averageByHour` has hour 9 complete and hour 10 absent; `eachDay` Wed points
  `[{hour: 9, …}]`; `chicago('2026-11-18T15:00:00Z')` is `{ day: 'Wed', date: 18, hour: 9, minute: 0 }`.
- [ ] **Step 2: Run** `npx vitest run src/lib/bggcon/analytics.test.ts` → FAIL.
- [ ] **Step 3: Implement**: Chicago parts with `Intl.DateTimeFormat('en-US', { timeZone:
  'America/Chicago', … })`, cached formatter.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(bggcon): per-hour and per-day activity views`.

### Task 5: The analytics route, switcher and summary numbers (viewer)

**Files:**
- Create: `src/routes/(app)/bggcon/analytics/+page.server.ts`,
  `src/routes/(app)/bggcon/analytics/+page.svelte`,
  `src/routes/(app)/bggcon/analytics/page.server.test.ts`,
  `src/routes/(app)/bggcon/BggconNav.svelte`
- Modify: `src/routes/(app)/bggcon/+page.svelte` (add `BggconNav` to its header)

**Interfaces:**
- Consumes: Task 3 client, Task 4 `kpis`.
- Produces: page data `{ activity: BggconActivity | null; games: BggconGames | null; error: string | null }`;
  `BggconNav` (`current: 'library' | 'analytics'`) = the existing `SegmentedControl` (`size="sm"`)
  with Library / Analytics, navigating with `goto('/bggcon')` / `goto('/bggcon/analytics')`.

- [ ] **Step 1: Failing load tests** (pattern: `admin/pipeline/page.server.test.ts`):
  signed-out → throws 401 (`requireUser`); both endpoints resolve → data returned, `error: null`;
  one rejects → `{ activity: null, games: null, error: <message> }`; `warehouseClient` throws
  synchronously (no `WAREHOUSE_API_URL`) → same message shape, no throw.
- [ ] **Step 2: Run** `npx vitest run "src/routes/(app)/bggcon/analytics"` → FAIL.
- [ ] **Step 3: Implement** the load; the page shell (`Container` > `Stack`: header with
  `BggconNav` and "as of", the error card as on `/admin/pipeline`, an empty state when
  `as_of` is null, then four summary cards in an `AutoGrid`: checkouts so far, in the last hour,
  busiest hour, different games checked out = games with `checkouts > 0`); `BggconNav` on both pages.
- [ ] **Step 4: Run** the tests → PASS; `npm run check` → 0 errors.
- [ ] **Step 5: Commit and push** `feat(bggcon): analytics page with library switcher`; open the
  viewer PR (draft until Task 6).

### Task 6: The charts (viewer)

**Files:**
- Create in `src/routes/(app)/bggcon/analytics/`: `ConTimeline.svelte`, `HourOfDay.svelte`,
  `EachDay.svelte`, `ByDay.svelte`, `GameRanks.svelte`
- Modify: `src/routes/(app)/bggcon/analytics/+page.svelte`

**Interfaces:**
- Consumes: Task 4 views; `BggconGames`.
- Produces: the mockup's charts, each in a `Card` with a `.chart-area`:
  - `ConTimeline` (`activity`): bar per 15-min bucket, Tue 00:00 to Sun 1 PM Chicago, closed
    time shaded (`isOpen`), a "now" line at `as_of`, the current bucket at reduced opacity,
    `var(--chart-2)`; hover tooltip with the range and count.
  - `HourOfDay` (`averageByHour`), `EachDay` (`eachDay`; Wed–Sun = `--chart-1`…`--chart-5`
    in that fixed order, legend, today's line thicker with a "so far" end dot), `ByDay`
    (`byDay`; partial day faded, days to come outlined): one `AutoGrid` row of three.
  - `GameRanks` (`games`, `kind: 'checkouts' | 'demand' | 'steam' | 'time'`), top 10 each in a
    2-column `AutoGrid`: bars by `checkouts`; bars on a fixed 0–100% scale by
    `minutes_all_out / open_minutes` (rows with `copies` null left out), copies beside the name;
    dumbbell `checkouts_prev_3h` (hollow) → `checkouts_last_3h` (filled), ranked by the rise;
    dot at `time_out_median` with a band `time_out_q1`–`time_out_q3`.
- [ ] **Step 1: Build each component** against the mockup.
- [ ] **Step 2: Verify:** `npm run check` → 0 errors; `npx vitest run src/lib/bggcon` → pass;
  Phil reviews on his own dev server (`just dev`) in light and dark; no dev server left running
  from this session.
- [ ] **Step 3: Commit and push** `feat(bggcon): analytics charts`; mark the PR ready.

## After both merge

- Phil merges the warehouse PR → `deploy-warehouse-api.yml` deploys the API; confirm the run
  passed. Then Phil cuts the viewer release.
- Don't run manual recorder test runs (`BGGCON_TEST_RUN=1`) during the con: their events land in
  the same table unmarked.
