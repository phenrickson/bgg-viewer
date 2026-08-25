import { F } from '../vizzes/lib.js';

export default {
	id: 'top-of-year',
	/**
	 * One row per publication year, 2010 through whichever year is current when this runs —
	 * a single RANK() OVER (PARTITION BY year_published ...) pass, not a query per year, and
	 * no hardcoded upper bound, so a new year needs nothing here once its best game clears the
	 * ratings floor. The floor (500) is deliberately lower than the main pool's 8,000: a recent
	 * year's best game may not have accumulated that many ratings yet, and a blank year reads
	 * as a bug rather than "too new to know."
	 */
	query: `
		WITH yearly AS (
			SELECT game_id,
				-- year_published is FLOAT64 in the warehouse; BigQuery can't PARTITION BY a
				-- float expression, so it's cast to INT64 first.
				RANK() OVER (PARTITION BY CAST(year_published AS INT64) ORDER BY geek_rating DESC) AS pos
			FROM ${F}
			WHERE geek_rating > 0 AND users_rated >= 500
				AND year_published BETWEEN 2010 AND EXTRACT(YEAR FROM CURRENT_DATE())
				AND COALESCE(image, thumbnail) IS NOT NULL
		)
		SELECT game_id FROM yearly WHERE pos = 1`,
	// `row.year` comes from the merged pool row (build-landing-content.js), not this query.
	fact: (row) => `Top game of ${row.year}`
};
