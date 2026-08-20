import { F, WORKING } from './lib.js';

export default {
	id: 'kickstarter-over-time',
	kind: 'line',
	title: 'The rise of Kickstarter',
	note: 'PLACEHOLDER — share of that year\'s rated releases tagged Crowdfunding: Kickstarter.',
	xLabel: 'Year',
	yLabel: '% of releases',
	query: `WITH yearly AS (
	     SELECT year_published AS yr, COUNT(*) AS total,
	            COUNTIF('Crowdfunding: Kickstarter' IN UNNEST(families)) AS ks
	     FROM ${F}
	     WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	     GROUP BY yr
	   )
	   SELECT 'Kickstarter' AS series, yr AS x, ROUND(100*ks/total, 1) AS y
	   FROM yearly ORDER BY yr`
};
