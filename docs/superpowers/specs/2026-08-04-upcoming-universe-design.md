# BGG Viewer — Upcoming Games & Prediction Emphasis — Design

**Date:** 2026-08-04
**Status:** Shipped — written after the fact, to record decisions the code now carries
**Builds on:** [2026-07-29-explore-workspace-design.md](2026-07-29-explore-workspace-design.md)
(that spec named "review predictions for upcoming games" as job #2 and put it behind a separate
`/predictions` page — this one revises that call)

> Copy note: all user-facing strings are **placeholder** — Phil writes the final copy.

## Goal

Let a user **sort and examine upcoming games** — releases nobody has played yet — and make a
game's own page emphasise the model when the model is the only thing with anything to say.

Explicitly *not* in scope: evaluating the model. See [Out of scope](#out-of-scope).

## What changed from the 07-29 spec

That spec, the explore mockup and the layout's nav comment all assumed **Predictions is its own
room**: a separate page, a separate population, a top-level nav sibling of Games. Three of those
four assumptions turned out to be wrong, and the fourth is now reserved for something else.

### 1. No new data. The catalog already has it.

`columns.ts` carried a note saying this view would need "its own artifact loaded on demand so a
session that never opens it never pays for it." It doesn't. `WORKING_SET_WHERE` is
`users_rated >= 30 OR year_published >= EXTRACT(YEAR FROM CURRENT_DATE())` — so **every upcoming
game is already in the artifact**, carrying all five model columns plus `sample_status` and
`training_cutoff_year`.

Measured against the warehouse on 2026-08-04:

| Era | Games | Have a prediction | Rated ≥30 |
|---|---|---|---|
| Upcoming (≥2026) | 4,842 | 4,842 | 372 |
| 2024–2025 | 12,414 | 12,235 | 2,615 |
| Older | 110,708 | 29,611 | 27,586 |

By year: 4,347 in 2026, 472 in 2027, 22 in 2028, 1 in 2030.

The marginal cost of the whole feature, in bytes, is **zero**.

### 2. `upcoming` is a universe, not a route

The first implementation built `PredictionScope`, `PredictionRail`, `PredictionChips` and
`PredictionTable` beside Explore's `Scope`, `Rail`, `FilterChips` and `GameList` — on the
theory that the populations were too different to share. That bought four near-copies to keep
in sync (the chip row was verbatim) and quietly dropped families, artists and the name search
that Explore has.

They are not too different. **Every numeric filter has a predicted twin**, so the universe can
decide which *column* each filter and each table cell reads:

| Filter | `top10k` / `rated` | `upcoming` |
|---|---|---|
| Complexity | `average_weight` | `predicted_complexity` |
| Average rating | `average_rating` | `predicted_rating` |
| Ratings count | `users_rated` | `predicted_users_rated` |
| Geek rating | `geek_rating` | `predicted_geek_rating` |

"Complexity 3.0–3.5" is the same question in both rooms; only the source answering it changes.
That single switch (`columnsFor` in [scope.ts](../../../src/lib/catalog/scope.ts)) is what lets
one `Scope`, one rail, one chip row, one table and one set of aggregates serve all three
universes.

`hurdleMin` is the one field only `upcoming` uses; `toWhere` ignores it elsewhere, because in
the rated slices every game has already cleared the hurdle.

The year dial needed no new field either — it is `yearMin`/`yearMax`, which already existed.

### 3. No `/predictions` route

Once `upcoming` was a universe, the route was Explore with the dial pre-set plus ~200 lines of
copied workspace. It is a **row in the Games menu** now, beside Discover and Explore — which is
what the layout's own comment prescribes for views that share a `Scope`. The menu row carries a
description where a top-level tab could only carry a word.

`/predictions` is deliberately left **unclaimed**, reserved for the modelling room (how the
model behaves, and how well it has done) — genuinely different data, and a real sibling of Games
when it exists.

## What the upcoming universe shows

### Filters

Everything Explore has, because the components are the same ones. Two differences:

- **A hurdle floor** (`Any / 25%+ / 50%+ / 80%+`, default 25%) appears only here. Most BGG
  entries never gather enough ratings to earn a geek rating, and without a floor the tail of
  placeholder records crowds the list. It is a chip as well as a control, because a filter that
  silently removes ~3,000 games has to be visible and removable.
- **The "Exact numbers" labels say "predicted"**, since that is what they are filtering.

`best_player_counts` is populated for **68 of 4,842** upcoming games — nobody has voted — so the
flagship filter of the rest of the app is dead weight here. "Plays with N" (the box's own range,
99.5% populated) does that job.

### The table

`GameList` holds two column sets and the universe picks one. `Best at` is dropped rather than
translated, and `P(hurdle)` takes the slot — the thing that explains why a strong-looking row
isn't.

Encodings follow the rated columns exactly, so a reader learns each measure once: a bar for the
rating, the five-segment meter for complexity. The **one** thing restated is the predicted-geek
bar's domain — `RatingBar`'s hardcoded 5.5–8.8 was set against a catalog reaching 8.7, and this
population runs 5.0–6.93 with a median of 5.46, so on that domain more than half of it would
render as an empty bar. The sorted column's header states its domain rather than assuming it.

### Field coverage, which shapes the row

| Field | Populated (of 4,842) |
|---|---|
| publishers | 4,829 (99.7%) |
| min/max players | 4,816 (99.5%) |
| categories | 4,763 (98%) |
| mechanics | 4,465 (92%) |
| designers | 4,033 (83%) |
| **best_player_counts** | **68 (1.4%)** |

The metadata line under each title carries **publisher** in this universe and not in the rated
ones: for a game nobody has played, designer + publisher + categories is the whole of what is
known, and publisher is the most complete of the three.

## The detail page — state-driven emphasis

A game reached from the upcoming list used to open on a hero of four actuals that said nothing
about why it was in that list, with the model panel at the foot of the right column.

**Placement follows recency; wording follows whether an actual exists.** Two different tests,
deliberately:

- `upcoming` = `year_published >= CURRENT_YEAR` — the same test the universe uses, so anything
  reachable from that list emphasises the model on its own page by construction.
- `isRated` = `geek_rating > 0` — decides "Model prediction" vs "What the model expected", which
  is the distinction the panel's copy already made.

They are not the same. A game published this year can hold a geek rating and still be mid-forecast:
Arkham Horror's 2026 core set has **823 ratings against a modelled 2,866**. Treating that as
settled buried the only card with anything to say about it.

So for a game published this year or later:

- The **model panel takes the wide left slot** the player-count chart holds otherwise.
- The **player-count chart drops to the foot** — its counts are community votes, and there are
  almost none.
- Each **hero stat carries `est. 6.93`** where a percentile would go. A percentile among rated
  games is a moving target while the ratings are still arriving; the estimate is the stronger of
  the two figures, and three lines per stat crowds the row.
- **Similar games never moves.** It is useful whatever state a game is in — which is why the
  panel had to become a component ([PredictionPanel.svelte](../../../src/lib/game/PredictionPanel.svelte))
  rather than shuffling the right column: a card cannot move between two grid parents any other way.

Settled games are the reverse, with the model at the foot of the right column.

### The panel's chart

Four rows, each `label · scale · estimate · actual`, drawn as a **dumbbell** — two dots on a
shared scale with the segment between them as the error.

It was a fill (estimate) plus a tick (actual) on one track first, and the two marks fought: an
actual close to the estimate landed on the bar's end and read as a cap; one below it sat inside
the bar and read as a defect. Neither said "two values". A fill was wrong for a second reason —
**none of these scales start at zero** (5–8.8, 5–10, 1–5), so a bar growing from the left edge
asserted a baseline that isn't there.

**Ratings is drawn on log10** over 10–100k, and labelled as such. Counts run from a handful to
~130,000, so on a linear axis a 103-against-1,262 miss — an order of magnitude — shows no gap at
all. [`aggregates.ts`](../../../src/lib/catalog/aggregates.ts) bins `users_rated` on log10 for
exactly this reason, so this agrees with the histograms rather than inventing a scale.

### The hurdle is a footnote here

It led the panel — a 1.7rem figure in a tinted box with its own bar — on the reasoning that
everything below it is conditional on it. True, and still the wrong weight for a page about one
game: by the time you are reading a game's page it reads 100% far more often than not, and a
figure that is the same on most pages cannot be what leads them.

**A hurdle is a first cut across a LIST** — is this a real release, or a record that exists and
little else. So it stays a rail filter and a table column, and is one line on the game.

## Data implications

- **No artifact change.** No new columns, no second artifact, no ETag churn.
- **No warehouse change.** `bgg_predictions` is read as it stands.
- `sample_status` is NULL for 11,698 rows pending
  [bgg-data-warehouse#96](https://github.com/phenrickson/bgg-data-warehouse/pull/96) and a full
  refresh. Nothing here depends on it: every game in this universe is out of sample by
  construction, and the panel's sample tag already treats NULL as "not yet known" rather than
  guessing.

## Open questions

- **Cover art.** Absent — no thumbnails in the artifact. ~4,800 URLs is far smaller than the 38k
  the Discover measurement was taken against, and this universe would use them well.
- **Whether 2027/2028 deserve separation.** 494 games between them, thin on designers and
  categories, currently mixed in behind a year filter.
- **New releases vs. reissues.** Five of the top fifteen 2026 games by predicted geek rating are
  special editions or reprints of known-good games. The model is right about them; "upcoming" may
  still want to distinguish them, and that is the one thing here that might need data we don't have.
- **The `est.` hero line replaces the percentile.** Worth checking that reads right on a game
  that is both recent and well-rated.

## Out of scope

- **Evaluating the model** — predicted vs. actual across a cohort, hurdle calibration, error by
  complexity. This needs data we don't have: 9,620 games from 2024–25 carry a prediction but never
  cleared 30 ratings, so they sit outside the working set, and any calibration built on the current
  artifact would be survivorship-biased. That is the `/predictions` room, and its own spec.
- **Collection** — its own room, its own data.

## Next

The modelling room at `/predictions`, when the evaluation data exists.
