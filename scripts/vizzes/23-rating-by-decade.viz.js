export default {
	id: 'rating-by-decade',
	kind: 'scatter',
	title: 'Ratings, decade by decade',
	note: 'PLACEHOLDER — average rating for a sample of games from each decade, with a few of the most popular named.',
	xLabel: 'Decade',
	yLabel: 'Average rating',
	// A whisker/range chart per decade collapsed the actual games into three numbers and lost
	// what those decades were actually LIKE — this shows real games instead. The x axis is
	// still discrete decades underneath, but the jitter is baked directly into the query's `x`
	// (not left to Scatter's own small auto-jitter, which is sized for continuous axes and
	// would barely spread a decade's games apart at all): FLOOR(year/10)*10, offset by a
	// deterministic ±4-year spread hashed off game_id, so each decade's cloud stays visually
	// separate from its neighbors (checked: a clean ~2-year gap between decades) without ever
	// reshuffling between rebuilds on unchanged data.
	cols: `FLOOR(year_published/10)*10 + (MOD(ABS(FARM_FINGERPRINT(CAST(game_id AS STRING))), 1000)/1000.0 * 8 - 4) AS x,
	       ROUND(average_rating,2) AS y`,
	where: `average_rating > 0 AND year_published BETWEEN 1980 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1`
};
