import { F, WORKING } from './lib.js';

export default {
	id: 'cooperative-games-over-time',
	kind: 'stack',
	title: 'The rise of cooperative games',
	note: 'PLACEHOLDER — rated releases each year, split by whether they have a Cooperative Game mechanic.',
	xLabel: 'Year',
	yLabel: 'Games',
	tickEvery: 5,
	// Same pattern as 14-solo-games-over-time.viz.js — two segments, one row per
	// (year, has-mechanic) pair, explicit ord to fix stack order regardless of UNION ALL's
	// unguaranteed execution order.
	query: `WITH yearly AS (
	     SELECT year_published AS yr,
	            COUNTIF('Cooperative Game' IN UNNEST(mechanics)) AS coop,
	            COUNTIF(NOT 'Cooperative Game' IN UNNEST(mechanics)) AS other
	     FROM ${F}
	     WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	     GROUP BY yr
	   )
	   SELECT series, x, y FROM (
	     SELECT 'Cooperative Game' AS series, yr AS x, coop AS y, 1 AS ord FROM yearly
	     UNION ALL
	     SELECT 'Everything else' AS series, yr AS x, other AS y, 2 AS ord FROM yearly
	   )
	   ORDER BY ord, x`,
	calloutTemplate: (year, count, pct) =>
		`PLACEHOLDER — ${pct}% of ${year}'s releases (${count.toLocaleString()} games) had a Cooperative Game mechanic.`
};
