import { F, WORKING } from './lib.js';

export default {
	id: 'rating-by-player-count',
	kind: 'range',
	title: 'Rating spread by player count',
	note: 'PLACEHOLDER — median average rating by player count, with the middle 50% of games (25th-75th percentile) as the band.',
	xLabel: 'Players',
	yLabel: 'Average rating',
	precision: 2,
	// average_rating, not geek_rating: geek_rating is Bayesian-shrunk toward BGG's floor
	// (~5.5) for anything short on votes, and 44% of the working set sits between 30-100
	// ratings — thin enough that geek_rating clusters almost entirely at that floor regardless
	// of player count, which flattens every band into a near-identical sliver (same trap
	// 10-weight-distribution.viz.js's `num_weights >= 5` filter exists to dodge, just for
	// weight instead of rating). average_rating has no such shrinkage.
	//
	// "Playable at N" (min_players <= N <= max_players), not "best at N" — that's a different
	// question already answered by 05-player-counts.viz.js off a different table
	// (best_player_counts). This is just: among games you CAN play at N, how do ratings spread.
	query: `WITH counts AS (
	     SELECT n AS x, average_rating
	     FROM ${F}, UNNEST(GENERATE_ARRAY(min_players, max_players)) AS n
	     WHERE ${WORKING} AND average_rating > 0
	       AND min_players IS NOT NULL AND max_players IS NOT NULL AND max_players >= min_players
	       AND n BETWEEN 1 AND 8
	   )
	   SELECT x,
	          APPROX_QUANTILES(average_rating, 4)[OFFSET(1)] AS low,
	          APPROX_QUANTILES(average_rating, 4)[OFFSET(2)] AS mid,
	          APPROX_QUANTILES(average_rating, 4)[OFFSET(3)] AS high
	   FROM counts
	   GROUP BY x
	   ORDER BY x`
};
