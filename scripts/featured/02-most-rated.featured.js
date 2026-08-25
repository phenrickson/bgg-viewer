import { F, WORKING } from '../vizzes/lib.js';

export default {
	id: 'most-rated',
	query: `SELECT game_id FROM ${F}
		WHERE ${WORKING} AND geek_rating > 0 AND COALESCE(image, thumbnail) IS NOT NULL
		ORDER BY users_rated DESC LIMIT 1`,
	fact: (row) => `The most-rated game on BGG, with ${row.usersRated.toLocaleString()} ratings`
};
