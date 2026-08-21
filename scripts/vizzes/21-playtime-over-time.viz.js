import { F, WORKING } from './lib.js';

export default {
	id: 'playtime-over-time',
	kind: 'line',
	title: 'Average playtime over time',
	note: 'Average listed playing time for games by year of release.',
	xLabel: 'Year',
	yLabel: 'Minutes',
	// max_playtime < 1000 excludes a handful of outlier entries (miscoded or genuinely
	// multi-day wargames) that would otherwise drag the axis out for a handful of games —
	// same reasoning as the ridge charts' tail-trimming, just done in SQL instead since this
	// is a single scalar per year, not a distribution.
	query: `SELECT 'Playtime' AS series, year_published AS x, ROUND(AVG(max_playtime)) AS y
	   FROM ${F}
	   WHERE ${WORKING} AND max_playtime > 0 AND max_playtime < 1000
	     AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	   GROUP BY x
	   ORDER BY x`
};
