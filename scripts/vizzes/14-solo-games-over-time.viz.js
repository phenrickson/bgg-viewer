import { F, WORKING } from './lib.js';

export default {
	id: 'solo-games-over-time',
	kind: 'line',
	title: 'The rise of solo games',
	note: 'PLACEHOLDER — share of that year\'s rated releases with a Solo / Solitaire Game mechanic.',
	xLabel: 'Year',
	yLabel: '% of releases',
	// Share, not raw count: total yearly output nearly doubled over this window, so a raw
	// count would conflate "solo games grew" with "everything grew."
	query: `WITH yearly AS (
	     SELECT year_published AS yr, COUNT(*) AS total,
	            COUNTIF('Solo / Solitaire Game' IN UNNEST(mechanics)) AS solo
	     FROM ${F}
	     WHERE ${WORKING} AND year_published BETWEEN 1995 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	     GROUP BY yr
	   )
	   SELECT 'Solo / Solitaire Game' AS series, yr AS x, ROUND(100*solo/total, 1) AS y
	   FROM yearly ORDER BY yr`
};
