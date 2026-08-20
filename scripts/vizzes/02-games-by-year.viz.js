import { F, WORKING } from './lib.js';

export default {
	id: 'games-by-year',
	kind: 'columns',
	title: 'Games released each year',
	note: 'Number of games by year of publication.',
	xLabel: 'Year',
	yLabel: 'Games',
	query: `SELECT year_published AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND year_published BETWEEN 1980 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	   GROUP BY v ORDER BY v`,
	tickEvery: 5,
	precision: 0,
	calloutTemplate: (v, n) =>
		`${v} was the biggest year on record, with ${n.toLocaleString()} releases rated by BGG.`
};
