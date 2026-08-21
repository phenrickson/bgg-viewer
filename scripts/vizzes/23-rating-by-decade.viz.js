export default {
	id: 'rating-by-decade',
	kind: 'scatter',
	title: 'Game ratings, decade by decade',
	note: 'Average rating for a sample of games from each decade, with a few of the most popular named.',
	xLabel: 'Decade',
	yLabel: 'Average rating',
	// A whisker/range chart per decade collapsed the actual games into three numbers and lost
	// what those decades were actually LIKE — this shows real games instead. The x axis is
	// still discrete decades underneath, but the jitter is baked directly into the query's `x`
	// (not left to Scatter's own small auto-jitter, which is sized for continuous axes and
	// would barely spread a decade's games apart at all): FLOOR(year/10)*10, offset by a
	// deterministic ±2-year spread hashed off game_id, so each decade's cloud stays visually
	// separate from its neighbors (a clean 6-year gap between decades) without ever reshuffling
	// between rebuilds on unchanged data. Kept fairly tight on purpose — wide enough to break
	// up the overplotting, not so wide the decade reads as smeared left-right.
	//
	// `decade` rides alongside `x` unjittered, purely so `opts.groupKey` below can group named
	// candidates by their REAL decade — grouping by jittered `x` itself risks a boundary game
	// (jitter can push it either side) landing in the wrong bucket.
	cols: `FLOOR(year_published/10)*10 + (MOD(ABS(FARM_FINGERPRINT(CAST(game_id AS STRING))), 1000)/1000.0 * 4 - 2) AS x,
	       ROUND(average_rating,2) AS y,
	       FLOOR(year_published/10)*10 AS decade`,
	where: `average_rating > 0 AND year_published BETWEEN 1980 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1`,
	opts: {
		// Plain year labels on the x-axis, not "1.98k"/"2k" — Scatter's default tick compaction
		// is right for a vote count in the thousands, wrong for a value that only looks like
		// one by coincidence.
		xPlain: true,
		// Explicit, not the auto-computed "nice step" — VizOfTheDay's generic tick-step picker
		// chose 20 for this span (raw ≈12, landing in its ">1, ≤2 of a power of ten" bucket),
		// which skipped 1990 and 2010 entirely. This IS the actual category axis, so it gets
		// every category labelled rather than whatever a continuous-axis heuristic lands on.
		xTicks: [1980, 1990, 2000, 2010, 2020],
		// Two named games per decade, not label()'s default "spread N across the x range" —
		// with 5 decades and jitter already doing the x-spreading, grouping by exact decade is
		// both simpler and safer (see the `decade` column comment above).
		groupKey: (r) => r.decade,
		perGroup: 2
	}
};
