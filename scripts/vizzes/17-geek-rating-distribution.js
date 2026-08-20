import { F, WORKING } from './lib.js';

export default {
	id: 'geek-rating-distribution',
	kind: 'columns',
	title: 'The spread of Geek ratings',
	note: 'BoardGameGeek uses Bayesian averaging for its Geek Rating, starting all games at 5.5',
	xLabel: 'Geek rating',
	yLabel: 'Games',
	query: `SELECT ROUND(geek_rating*8)/8 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND geek_rating > 0 GROUP BY v ORDER BY v`,
	tickEvery: 4,
	precision: 1,
	calloutTemplate: (v, n, pct, total, mean) =>
		`The typical Geek rating for a game is ${mean.toFixed(2)} out of 10.`
};
