import { F, WORKING } from './lib.js';

export default {
	id: 'kickstarter-over-time',
	kind: 'stack',
	title: 'The rise of Kickstarter',
	note: 'PLACEHOLDER — rated releases each year, split by whether they were tagged Crowdfunding: Kickstarter.',
	xLabel: 'Year',
	yLabel: 'Games',
	tickEvery: 5,
	query: `WITH yearly AS (
	     SELECT year_published AS yr,
	            COUNTIF('Crowdfunding: Kickstarter' IN UNNEST(families)) AS ks,
	            COUNTIF(NOT 'Crowdfunding: Kickstarter' IN UNNEST(families)) AS other
	     FROM ${F}
	     WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	     GROUP BY yr
	   )
	   SELECT series, x, y FROM (
	     SELECT 'Kickstarter' AS series, yr AS x, ks AS y, 1 AS ord FROM yearly
	     UNION ALL
	     SELECT 'Everything else' AS series, yr AS x, other AS y, 2 AS ord FROM yearly
	   )
	   ORDER BY ord, x`,
	calloutTemplate: (year, count, pct) =>
		`PLACEHOLDER — ${pct}% of ${year}'s rated releases (${count.toLocaleString()} games) were tagged Crowdfunding: Kickstarter.`
};
