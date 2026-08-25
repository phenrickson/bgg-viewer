import { F, WORKING } from '../vizzes/lib.js';

export default {
	id: 'highest-coop',
	// 'Cooperative Game' lives in `mechanics`, not `categories` — same column
	// `20-cooperative-games-over-time.viz.js` reads for the same label.
	query: `SELECT game_id FROM ${F}
		WHERE ${WORKING} AND geek_rating > 0
			AND 'Cooperative Game' IN UNNEST(mechanics)
			AND COALESCE(image, thumbnail) IS NOT NULL
		ORDER BY geek_rating DESC LIMIT 1`,
	fact: () => `The highest-rated cooperative game`
};
