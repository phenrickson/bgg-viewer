# Play time in the catalog, Explore and Discover — design

**Date:** 2026-09-24
**Status:** Draft — defaults below need Phil's yes
**Branch:** `feat/catalog-playtime` (from `main`), one PR

## Why

Play time is one of the first things anyone asks about a game, and the catalog doesn't
carry it: you can't filter by it in Explore or Discover, and the Recommend tool can't say
"both play in about an hour" when explaining a match. The structural embedding already uses
it — `min_playtime`, `max_playtime` and `time_per_player` are model inputs
(bgg-predictive-models `src/models/embeddings/trainer.py`) — so the catalog is the odd one
out.

## 1. Catalog columns

Add to `SCALAR_COLUMNS` in `src/lib/server/catalog/columns.ts` (the one definition behind
both the BigQuery SELECT and the Arrow schema):

- `min_playtime` — `int`, from `games_features`
- `max_playtime` — `int`, from `games_features`
- `time_per_player` — `float`, **derived in the catalog query** with the model's rule
  (bgg-predictive-models `src/features/transformers.py` `_create_time_per_player`):
  `max_playtime / max_players`, NULL when either is 0 or NULL.

`0` in `games_features` means "not listed" on BGG; the catalog carries it as NULL for all
three so no filter or aggregate treats it as a real zero-minute game.

Cost: three numeric columns over ~36k rows — a small size increase and a new catalog
version (content hash) on the next build. The GCS rail and `ETag` handle the rest.

## 2. Scope

Two new fields on the shared `Scope`, so Explore, Discover and the map all read the same
filter from the same querystring:

- `playtimeMin: number | null`, `playtimeMax: number | null` — minutes.
- URL params `tmin` / `tmax` (checked free: `p`, `x`, `y`, `c`, `s`, `fx`, `fy`, `ctx` are
  taken by the map; the rest by `Scope`).
- **Filter semantics (default):** on `max_playtime` — the box's upper bound, which is how
  people read "how long is it". `tmax=60` = "done within an hour"; `tmin=120` = "a long
  game". A game with no listed time drops out while either bound is set.
- `toWhere` adds `max_playtime >= tmin` / `max_playtime <= tmax`; `activeFilters` gets a
  chip ("Play time ≤ 60 min", "60–120 min") with the usual clear patch.

## 3. Explore

A **Play time** control in the rail, beside player count, using the existing range-slider
pattern. Stops on a play-time scale, not linear minutes: 15, 30, 45, 60, 90, 120, 180, 240+
(the long tail — 600-minute wargames — collapses into the top stop).

## 4. Discover — a fourth dial

`dials.ts` warns that a fourth dial is the failure mode Discover exists to avoid; Phil's
call (2026-09-24) is that play time earns it. The comment gets updated to say so.

Four chips, patching `playtimeMin`/`playtimeMax`, one at a time (like the complexity dial):

| Chip | Scope |
| --- | --- |
| Under 30 min | `tmax=30` |
| 30–60 min | `tmin=30&tmax=60` |
| 1–2 hours | `tmin=60&tmax=120` |
| 2+ hours | `tmin=120` |

Labels are placeholders (Phil writes copy). Chip counts to be checked against the catalog
before choosing the band edges, as the category chips were.

## Not in this PR

- `time_per_player` as a filter — it rides in the catalog for the Recommend tool's "why"
  and for later, not as a control.
- The Recommend tool's "why" panel itself (lives on `feat/recommend-tool`).
- Showing play time on game cards/rows — easy follow-up once the column exists.

## Open for Phil

1. Filter on `max_playtime` (default) vs requiring the game's whole range to fit.
2. Discover band edges and labels.
