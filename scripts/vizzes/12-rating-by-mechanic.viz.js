import { F, WORKING } from './lib.js';

export default {
	id: 'rating-by-mechanic',
	kind: 'bars',
	title: 'Which mechanics rate best?',
	note: 'PLACEHOLDER — average geek rating by mechanic, among mechanics used in at least 500 rated games.',
	xLabel: 'Average geek rating',
	yLabel: 'Mechanic',
	// `Tags` excluded: it only appears on a cluster of top-tier modern games (Brass:
	// Birmingham, Gloomhaven, Ark Nova...), which isn't how a real mechanic distributes —
	// looks like a data artifact upstream, not a genuine BGG mechanic.
	query: `SELECT m AS label, ROUND(AVG(geek_rating), 2) AS n
	   FROM ${F}, UNNEST(mechanics) AS m
	   WHERE ${WORKING} AND geek_rating > 0 AND m != 'Tags'
	   GROUP BY m
	   HAVING COUNT(*) >= 500
	   ORDER BY n DESC
	   LIMIT 12`
};
