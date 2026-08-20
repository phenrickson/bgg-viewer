import { F, WORKING } from './lib.js';

export default {
	id: 'rating-by-designer',
	kind: 'bars',
	style: 'dots',
	title: 'The highest-rated designers',
	note: 'Average geek rating by designer, among designers credited on at least 5 games.',
	xLabel: 'Average geek rating',
	yLabel: 'Designer',
	query: `SELECT d AS label, ROUND(AVG(geek_rating), 2) AS n
	   FROM ${F}, UNNEST(designers) AS d
	   WHERE ${WORKING} AND geek_rating > 0
	   GROUP BY d
	   HAVING COUNT(*) >= 5
	   ORDER BY n DESC
	   LIMIT 12`
};
