import { F, WORKING, PROJECT } from './lib.js';

/** Only this viz reads `best_player_counts` — not worth a shared constant in lib.js for one query. */
const BPC = `\`${PROJECT}.analytics.best_player_counts\``;

export default {
	id: 'rating-by-player-count',
	kind: 'ridge',
	title: 'Rating distribution by best player count',
	note: 'PLACEHOLDER — the shape of average rating among games best at each player count, not just its average.',
	xLabel: 'Average rating',
	yLabel: 'Density',
	precision: 1,
	order: ['1', '2', '3', '4', '5', '6', '7', '8'],
	// The flagship best_player_counts join, same as 05-player-counts.viz.js — which player
	// count a game is BEST at, not just playable at (BGG itself cannot query this).
	//
	// average_rating, not geek_rating: geek_rating is Bayesian-shrunk toward BGG's floor
	// (~5.5) for anything short on votes, and the working set is thin enough (44% of it under
	// 100 ratings) that every player count ends up clustered at that floor regardless of any
	// real difference — same trap 10-weight-distribution.viz.js's `num_weights >= 5` filter
	// exists to dodge, just for rating instead of weight.
	//
	// One row per game, no bucketing/rounding — ridge() computes a real KDE from the raw
	// values (see its own comment for why: histogram buckets at these group sizes just
	// produced sampling noise, not a density).
	query: `SELECT SAFE_CAST(TRIM(p) AS INT64) AS label, f.average_rating AS x
	   FROM ${F} f JOIN ${BPC} b USING (game_id),
	        UNNEST(SPLIT(b.best_player_counts, ',')) AS p
	   WHERE ${WORKING} AND f.average_rating > 0
	     AND TRIM(p) IN ('1', '2', '3', '4', '5', '6', '7', '8')`
};
