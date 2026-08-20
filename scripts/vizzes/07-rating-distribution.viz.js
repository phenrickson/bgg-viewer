import { F, WORKING } from './lib.js';

export default {
	id: 'rating-distribution',
	kind: 'columns',
	title: 'How Users Rate Games on BoardGameGeek',
	note: 'PLACEHOLDER — average rating, in half-point buckets.',
	xLabel: 'Average rating',
	yLabel: 'Games',
	query: `SELECT ROUND(average_rating*2)/2 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_rating > 0 GROUP BY v ORDER BY v`,
	tickEvery: 4,
	precision: 1,
	calloutTemplate: (v, n, pct) =>
		`PLACEHOLDER — the catalog piles up around ${v.toFixed(1)}: ${pct}% of games sit in this one half-point bucket.`
};
