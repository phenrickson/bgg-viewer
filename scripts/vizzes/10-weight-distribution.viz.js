import { F, WORKING } from './lib.js';

export default {
	id: 'weight-distribution',
	kind: 'columns',
	title: 'How heavy the catalog is',
	note: 'PLACEHOLDER — community complexity, in quarter-point buckets.',
	xLabel: 'Complexity',
	yLabel: 'Games',
	// `num_weights >= 5` is load-bearing. Without it the peak lands on 1.00 -- the FLOOR of
	// BGG's 1-5 scale -- where 51% of the games have three or fewer weight votes. That is a
	// boundary pile-up of thinly-rated games, not a community preference, and the chart
	// confidently explained it as one. games/[id]/+page.server.ts already carries a comment
	// about exactly this trap; this query had walked straight into it.
	query: `SELECT ROUND(average_weight*4)/4 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_weight > 0 AND num_weights >= 5
	   GROUP BY v ORDER BY v`,
	tickEvery: 4,
	precision: 2,
	calloutTemplate: (v, n, pct) =>
		`PLACEHOLDER — ${v.toFixed(2)} is the most common weight, ${pct}% of games with a settled complexity score.`
};
