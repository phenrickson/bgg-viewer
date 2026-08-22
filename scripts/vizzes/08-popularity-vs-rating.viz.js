export default {
	id: 'popularity-vs-rating',
	kind: 'scatter',
	title: 'Popularity vs rating',
	note: 'Number of user ratings (logged) vs ratings for games',
	xLabel: 'Average rating',
	yLabel: 'Popularity (logged)',
	cols: 'average_rating AS x, log(users_rated) AS y',
	where: 'geek_rating > 0',
	/*
	 * `y` (popularity) is pre-logged in SQL above, not via `yLog` — ratings run from 30 to
	 * ~135,000, and linear that's one clump against the axis with a handful of outliers strung
	 * out to the right. `xLog: true` used to sit here instead, which mislabeled `x` (average
	 * rating, a plain ~1-10 scale) as a log axis. That didn't just draw it wrong:
	 * `VizOfTheDay`'s tick generator computes log-spaced ticks (powers of ten) over a domain
	 * that never contains one, so it silently produced zero ticks — the x-axis rendered with
	 * no tick marks at all.
	 */
	opts: {
		// A targeted swap on the automatic pick, not a replacement of it — the remaining
		// auto-picked games fill out the rest of the chart on their own and can drift as
		// ratings accumulate. `exclude` keeps specific games out of the running so they can't
		// keep winning their bucket; `highlights` force-includes TI4/Brass: Birmingham on top,
		// regardless of which bucket they'd land in.
		exclude: ['Munchkin', 'Carcassonne', 'Exploding Kittens'],
		highlights: ['Twilight Imperium: Fourth Edition', 'Brass: Birmingham']
	}
};
