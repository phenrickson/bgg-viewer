import { F, WORKING } from './lib.js';

export default {
	id: 'rating-by-designer',
	kind: 'bars',
	style: 'dots',
	title: 'The highest- and lowest-rated designers',
	note: 'PLACEHOLDER — average geek rating by designer, best and worst 6, among designers credited on at least 5 rated games.',
	xLabel: 'Average geek rating',
	yLabel: 'Designer',
	query: `WITH ranked AS (
	     SELECT d AS label, ROUND(AVG(geek_rating), 2) AS n
	     FROM ${F}, UNNEST(designers) AS d
	     WHERE ${WORKING} AND geek_rating > 0
	     GROUP BY d
	     HAVING COUNT(*) >= 5
	   )
	   SELECT label, n FROM (
	     (SELECT label, n, 1 AS grp FROM ranked ORDER BY n DESC LIMIT 6)
	     UNION ALL
	     (SELECT label, n, 2 AS grp FROM ranked ORDER BY n ASC LIMIT 6)
	   )
	   ORDER BY grp, n DESC`
};
