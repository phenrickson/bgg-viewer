import { F, WORKING } from './lib.js';

export default {
	id: 'rating-distribution',
	kind: 'columns',
	title: 'The spread of average ratings',
	note: 'How users rate games on BoardGameGeek',
	xLabel: 'Average rating',
	yLabel: 'Games',
	query: `SELECT ROUND(average_rating*8)/8 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_rating > 0 GROUP BY v ORDER BY v`,
	tickEvery: 4,
	precision: 1,
	calloutTemplate: (v, n, pct, total, mean) =>
		`The average rating for a game is ${mean.toFixed(2)} out of 10.`
};
