import { F, WORKING } from './lib.js';

export default {
	id: 'solo-games-over-time',
	kind: 'stack',
	title: 'The rise of solo games',
	note: 'Solo/Solitaire mechanics jumped during the pandemic and have been popular ever since.',
	xLabel: 'Year',
	yLabel: 'Games',
	tickEvery: 5,
	// Two segments, one row per (year, has-mechanic) pair — `stack()` in lib.js pivots this the
	// same way `line()` does. Explicit `1 AS ord`/`2 AS ord` (rather than relying on UNION ALL's
	// execution order, which isn't guaranteed) fixes which segment stacks on the bottom.
	query: `WITH yearly AS (
	     SELECT year_published AS yr,
	            COUNTIF('Solo / Solitaire Game' IN UNNEST(mechanics)) AS solo,
	            COUNTIF(NOT 'Solo / Solitaire Game' IN UNNEST(mechanics)) AS other
	     FROM ${F}
	     WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	     GROUP BY yr
	   )
	   SELECT series, x, y FROM (
	     SELECT 'Solo / Solitaire Game' AS series, yr AS x, solo AS y, 1 AS ord FROM yearly
	     UNION ALL
	     SELECT 'Everything else' AS series, yr AS x, other AS y, 2 AS ord FROM yearly
	   )
	   ORDER BY ord, x`,
	calloutTemplate: (year, count, pct) =>
		`${pct}% of ${year}'s releases (${count.toLocaleString()} games) had a Solo / Solitaire Game mechanic.`
};
