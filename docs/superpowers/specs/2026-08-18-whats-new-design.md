# BGG Viewer — What's New — Design

**Date:** 2026-08-18
**Status:** Draft for review

## Goal

A page to monitor games that have been added to the warehouse recently — the first
slice of a broader "monitor my ETL jobs" surface, scoped down to just this for now.

## Current gap

bgg-viewer's catalog has no concept of recency today. The working-set artifact
(`analytics.games_features` + `analytics.best_player_counts` +
`predictions.bgg_predictions`, built in `src/lib/server/catalog/build.ts`) is scoped
by rating/year for browsing, not by when a game entered the warehouse, and it carries
no first-seen timestamp.

bgg-dash-viewer already solves this exact problem, working code today
(`src/data/bigquery_client.py:get_new_games` / `get_new_games_summary`, wired to the
`/app/new-games` page in `src/layouts/new_games.py` /
`src/callbacks/new_games_callbacks.py`): a CTE computes
`MIN(fetch_timestamp) AS first_fetch_timestamp` per `game_id` from
`raw.fetched_responses` (`WHERE fetch_status = 'success'`), joined to
`core.games_active` plus designer/publisher/category aggregates, filtered to a
days-back window, queried live with no caching. This spec reuses that exact
definition and query shape rather than inventing a new one — the only real change is
porting it into bgg-viewer's stack (SvelteKit server route instead of a Dash
callback).

## Approach

### Backend

bgg-viewer never queries BigQuery directly for this feature. It goes through
`warehouseClient()` (HTTP to the `warehouse-api` Cloud Run service in
bgg-data-warehouse), the same path the game-detail page already uses — not the
direct-BigQuery pattern `catalog/build.ts` uses for the working-set artifact. Two
reasons this is the right call, not just a style preference:

- Warehouse-internals access (raw tables, join logic, query tuning) stays owned by
  the warehouse's own API, in one place, rather than every consuming app (bgg-viewer
  today, potentially others later) holding its own BigQuery credentials and copies of
  the query logic.
- It turns out to cost nothing extra: `src/warehouse/readers/games.py` already has
  `get_provenance()`, which queries `raw.fetched_responses` directly, serving the
  existing `/games/{id}/provenance` endpoint. Warehouse-api's runtime service account
  (`bgg-data-warehouse@...`, confirmed in `cloudbuild.warehouse-api.yaml`) already
  has full BigQuery access. **No new IAM grant, no Terraform change, anywhere** — the
  data this page needs is already reachable from where it already lives.

Concretely, in **bgg-data-warehouse**:

- A new reader (in `src/warehouse/readers/games.py` or a sibling
  `src/warehouse/readers/monitoring.py`), same DI-testable shape as every other
  reader (`client` param, `bigquery.ScalarQueryParameter`, `dataset()` for table
  resolution — never a hard-coded project/dataset string):

  ```sql
  WITH first_fetches AS (
    SELECT game_id, MIN(fetch_timestamp) AS first_seen
    FROM `{dataset('raw')}.fetched_responses`
    WHERE fetch_status = 'success'
    GROUP BY game_id
  )
  SELECT g.game_id, g.name, g.year_published, g.thumbnail,
         ff.first_seen, p.predicted_hurdle_prob
  FROM first_fetches ff
  JOIN `{dataset('analytics')}.games_features` g USING (game_id)
  LEFT JOIN `{dataset('predictions')}.bgg_predictions` p USING (game_id)
  WHERE ff.first_seen > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days_back DAY)
  ORDER BY ff.first_seen DESC
  LIMIT @limit
  ```

  Deliberately thinner than bgg-dash-viewer's version of this same query: no
  designer/publisher/category joins — clicking through to the game-detail page
  already answers "what is this," so this only needs enough to identify the game and
  let you decide whether to click. `games_features` (not `games_active`) because it
  holds every game in the warehouse unfiltered — the working-set `WHERE` is applied
  only when building bgg-viewer's catalog artifact, not baked into the table.
- Checked live: `raw.fetched_responses` is small (458,252 rows, ~29 MB) and grows
  ~1,030 rows/day (measured over the last 14 days) — the actual query above dry-runs
  at ~36 MB scanned. Cheap now and for the foreseeable future; worth a re-check if
  usage patterns change, not a blocker today.
- New router endpoint, `GET /new-games?days=&limit=`, in a new
  `services/warehouse_api/routers/monitoring.py` (or added to `routers/games.py`),
  wired into `services/warehouse_api/main.py` the same way `games.router` is.
- `predicted_hurdle_prob` is returned **raw** — a nullable float, no threshold logic
  in the reader or the router. Tier boundaries are a display decision (see below) and
  stay in bgg-viewer's frontend so they can be retuned without a warehouse-api
  redeploy.

In **bgg-viewer**:

- `warehouseClient()` (`src/lib/server/warehouse/client.ts`) gains `getNewGames(days)`,
  calling the new endpoint with the same `authedGet`/ID-token pattern `getGame()`
  already uses. `types.ts` gains the response shape.
- `src/routes/(app)/whats-new/+page.server.ts` — a server `load` (like the
  game-detail page's) reading `?days=` from the URL, validated against `{7, 30, 365}`,
  default 7, calling `warehouseClient().getNewGames(days)`.

### Frontend

- `+page.svelte`: a day-range toggle (7/30/365, plain `?days=` links) above a plain
  list — **every** game in the window, always, unfiltered. `predicted_hurdle_prob`
  never removes a row from this list; it only adds emphasis to some rows.
- Each row: thumbnail + name + year + first-seen date. **The whole row links to
  `/games/{game_id}`** — same "whole row is one click target" convention
  `GameList.svelte` already uses. This list answers "what showed up"; the existing
  detail page answers everything else.
- **Surfacing standouts**: a badge per row, computed client-side from the raw
  `predicted_hurdle_prob` bgg-viewer already measured (median 0.22, Q3 0.39, ~12% of
  recent games score ≥0.5, ~5% score ≥0.7):
  - `≥ 0.7` → solid `--color-positive` badge, "standout" — top ~5%.
  - `0.5 – 0.7` → subtle/outline `--color-positive` badge, "promising" — next ~7%.
  - `< 0.5`, or no prediction row at all → no badge. Both tokens are the same hue
    (bgg-viewer's `app.css` only defines `--color-positive`/`--color-negative` today;
    both tiers are the same *kind* of signal, just different confidence, so weight
    differentiates rather than a second hue), and every badge carries a text label —
    never color alone.
  - A game with no prediction (~28% of recent additions — some awaiting the next
    `games_features` build, some outside the scoring pipeline's year window, some
    missing `year_published`) reads identically to a low-probability game: no badge,
    no separate "not yet scored" label. Revisit if that ambiguity turns out to
    matter in practice.
  - Optional: a small "Worth checking out" callout above the main list, pulling the
    top few by `predicted_hurdle_prob` from the same window — a shortcut, not a
    second data source. The full list below is unaffected either way.

## Out of scope (this increment)

- Job status, run history, or error/failure monitoring — later slices of the same
  broader initiative, not this page.
- Role-based access control — reused the existing single-tier login as-is.
- Any Dataform model or schema change in `bgg-data-warehouse` — `raw.fetched_responses`
  and `predictions.bgg_predictions` already have what's needed. (There *is* a small
  warehouse-api code change — a new reader + endpoint — see Approach.)
- Designer/publisher/category display — available one click away on the detail page.

## Open questions

- Whether the "Worth checking out" callout ships in this pass or the badge alone is
  enough for v1.
- Whether an unscored game should eventually get its own "not yet scored" treatment,
  once it's clear from use whether the ambiguity with "scored low" actually bothers
  anyone.

## Branching & delivery

Feature branch `feat/whats-new-page` off `main`, PR to `main`.
