import { F, PROJECT } from './lib.js';

/** Only this viz reads `best_player_counts` — not worth a shared constant in lib.js for one query. */
const BPC = `\`${PROJECT}.analytics.best_player_counts\``;

export default {
	id: 'player-counts',
	kind: 'columns',
	title: 'What player counts games are best at',
	note: 'How many games are best at different player counts.',
	xLabel: 'Players',
	yLabel: 'Games',
	// The flagship query: which player count a game is BEST at. BGG cannot query this.
	query: `SELECT SAFE_CAST(TRIM(x) AS INT64) AS v, COUNT(*) AS n
	   FROM ${F} f JOIN ${BPC} b USING (game_id),
	        UNNEST(SPLIT(b.best_player_counts, ',')) AS x
	   WHERE f.users_rated >= 30 AND TRIM(x) != ''
	   GROUP BY v HAVING v BETWEEN 1 AND 8 ORDER BY v`,
	tickEvery: 1,
	precision: 0,
	calloutTemplate: (v, n) =>
		`${v} players is the most common sweet spot: ${n.toLocaleString()} games are best at this player count, more than any other.`
};
