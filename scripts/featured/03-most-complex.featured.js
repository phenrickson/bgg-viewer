import { F, WORKING } from '../vizzes/lib.js';

export default {
	id: 'most-complex',
	// Ratings floor (100) keeps this from picking an obscure, barely-rated game whose weight
	// is really just noise from a handful of votes — "heaviest" should mean a real, played game.
	query: `SELECT game_id FROM ${F}
		WHERE ${WORKING} AND geek_rating > 0 AND users_rated >= 100
			AND COALESCE(image, thumbnail) IS NOT NULL
		ORDER BY average_weight DESC LIMIT 1`,
	fact: (row) => `The heaviest game with real community traction, at ${row.weight?.toFixed(2)}/5`
};
