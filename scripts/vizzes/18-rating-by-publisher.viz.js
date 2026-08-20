import { F, WORKING } from './lib.js';

// Descending by average rating (GMT highest, Hasbro lowest) — lanes read top-to-bottom as a
// ranking, not just an arbitrary list, matching how 12/13's bar charts already order best-first.
const ORDER = [
	'GMT Games',
	'IELLO',
	'Fantasy Flight Games',
	'Pegasus Spiele',
	'Z-Man Games',
	'Rio Grande Games',
	'Queen Games',
	'Avalon Hill',
	'Ravensburger',
	'Hasbro'
];

export default {
	id: 'rating-by-publisher',
	kind: 'ridge',
	title: 'Rating distribution by publisher',
	note: 'PLACEHOLDER — the shape of average rating across each publisher’s catalog, not just its average.',
	xLabel: 'Average rating',
	yLabel: 'Share of games',
	precision: 1,
	order: ORDER,
	// Ten well-known publishers that actually release original games (not the regional
	// reprint/localization houses that dominate the catalog by raw volume — Korea Boardgames,
	// Hobby Japan, Devir, etc.). `Avalon Hill` merges BGG's two label variants for the same
	// publisher across eras — the raw '(Self-Published)'/'(Web published)' pseudo-publishers
	// and other noise never enters into it since this is an explicit allowlist, not a top-N.
	query: `WITH tagged AS (
	     SELECT
	       CASE WHEN p IN ('Avalon Hill', 'The Avalon Hill Game Co') THEN 'Avalon Hill' ELSE p END AS label,
	       ROUND(average_rating*8)/8 AS bucket
	     FROM ${F}, UNNEST(publishers) AS p
	     WHERE ${WORKING} AND average_rating > 0
	       AND p IN ('Hasbro', 'Pegasus Spiele', 'Ravensburger', 'IELLO', 'Rio Grande Games',
	                 'Avalon Hill', 'The Avalon Hill Game Co', 'GMT Games', 'Z-Man Games',
	                 'Fantasy Flight Games', 'Queen Games')
	   )
	   SELECT label, bucket, COUNT(*) AS n
	   FROM tagged
	   GROUP BY label, bucket
	   ORDER BY label, bucket`
};
