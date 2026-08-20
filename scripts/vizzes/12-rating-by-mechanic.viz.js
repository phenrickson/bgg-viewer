import { F, WORKING } from './lib.js';

export default {
	id: 'rating-by-mechanic',
	kind: 'bars',
	style: 'dots',
	title: 'Which mechanics rate best?',
	note: 'PLACEHOLDER — average geek rating by mechanic, best and worst 6, among mechanics used in at least 500 rated games.',
	xLabel: 'Average geek rating',
	yLabel: 'Mechanic',
	// `Tags` excluded: it only appears on a cluster of top-tier modern games (Brass:
	// Birmingham, Gloomhaven, Ark Nova...), which isn't how a real mechanic distributes —
	// looks like a data artifact upstream, not a genuine BGG mechanic.
	//
	// Top 6 + bottom 6, not top 12: ratings here cluster in a ~0.6-point band, so a bare
	// top-12 barely differentiates itself from a top-6. Including the worst 6 widens the
	// range that's actually being shown, and — rendered as `style: 'dots'` rather than
	// zero-baseline bars — that's what makes position on the scale readable at all.
	query: `WITH ranked AS (
	     SELECT m AS label, ROUND(AVG(geek_rating), 2) AS n
	     FROM ${F}, UNNEST(mechanics) AS m
	     WHERE ${WORKING} AND geek_rating > 0 AND m != 'Tags'
	     GROUP BY m
	     HAVING COUNT(*) >= 500
	   )
	   SELECT label, n FROM (
	     (SELECT label, n, 1 AS grp FROM ranked ORDER BY n DESC LIMIT 6)
	     UNION ALL
	     (SELECT label, n, 2 AS grp FROM ranked ORDER BY n ASC LIMIT 6)
	   )
	   ORDER BY grp, n DESC`
};
