/**
 * Shapes for the landing page's warm-gap content — the viz and the game shown while the
 * catalog loads into DuckDB.
 *
 * This content is *baked*, not queried at runtime. The whole point is that it renders with
 * the page: the gap it fills starts the moment the landing page is done, so anything that
 * needed a round-trip to appear would arrive after the problem it solves.
 */

/**
 * A named point drawn on top of a cloud. A few hundred anonymous dots state a shape but no
 * fact you can hold onto; naming half a dozen games you recognise is what turns the plot into
 * something you can read a claim off.
 */
export interface Annotation {
	x: number;
	y: number;
	label: string;
}

/** A scatter's points are `[x, y]` pairs rather than objects — halves the JSON. */
export interface ScatterViz {
	kind: 'scatter';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	points: [number, number][];
	annotations?: Annotation[];
	/** Log10 the axis — for anything spanning orders of magnitude, like vote counts. */
	xLog?: boolean;
	yLog?: boolean;
}

/** Discrete numeric buckets as `[value, count]` pairs, same reasoning. */
export interface ColumnsViz {
	kind: 'columns';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	bins: [number, number][];
	/**
	 * Label every Nth bucket. Set by the generator, which knows how many buckets it emitted;
	 * labelling by *index* rather than by value is what makes this work for both years
	 * (1995…2025) and ratings (3.0…9.5) without a special case per series.
	 */
	tickEvery?: number;
	/** Decimal places for the bucket labels — 0 for years and player counts, 1 for ratings. */
	precision?: number;
	/**
	 * The takeaway, stated. A bare distribution shows a shape and leaves the reader to work
	 * out whether it is surprising; this is where the chart says what it thinks. The
	 * highlighted bucket is drawn in `--primary` so the sentence and the bar point at the
	 * same thing.
	 */
	callout?: { text: string; at: number };
}

/**
 * Categorical bars, horizontal. Vertical columns with rotated labels are unreadable for
 * things like "Cooperative Game" or "Hans im Glück", and these series are exactly the ones
 * this app exists to make queryable — so they get a form that can show their names.
 */
export interface BarsViz {
	kind: 'bars';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	bars: { label: string; value: number }[];
	/**
	 * `'dots'` positions each value on a shared scale zoomed to the data's own range, instead
	 * of a zero-baseline bar. Length-from-zero is right for counts (a mechanic used in 8,000
	 * games really is that many times longer than one used in 500); it's wrong for something
	 * like an average rating, where every bar ends up nearly full-length and the real
	 * differences — the entire point of the chart — become imperceptible. Position doesn't
	 * carry bar's implicit "from nothing" claim, so zooming the scale here isn't the
	 * truncated-axis anti-pattern it would be on a bar.
	 */
	style?: 'bars' | 'dots';
}

/**
 * A trend over a continuous axis (year). Wide format — one row per x, each series reading its
 * own field off that row — rather than one array per series, so multiple series share exactly
 * one x-axis without duplicating it or risking two series disagreeing on what x means.
 */
export interface LineViz {
	kind: 'line';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	/** Which fields on `points` are series, in draw order (also legend/color order). */
	series: { key: string; label: string }[];
	points: ({ x: number } & Record<string, number>)[];
	/**
	 * `points`' y values are already a 0-100 share, not a raw count — a `line` viz can plot
	 * either, so this is what tells the gridline labels to append `%` instead of guessing from
	 * `yLabel`'s text.
	 */
	yPercent?: boolean;
}

/**
 * Stacked vertical bars over a continuous axis (year) — same `series`/`points` shape as
 * `LineViz` (one row per x, each series its own field), rendered as cumulative segments
 * instead of a connected line. For "how many releases have X vs. don't," where both the
 * absolute count AND the split matter — a line of shares alone drops the absolute-growth
 * story a stack keeps.
 */
export interface StackViz {
	kind: 'stack';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	/** Stack order bottom-to-top (also legend/color order). */
	series: { key: string; label: string }[];
	points: ({ x: number } & Record<string, number>)[];
	/** Label every Nth bucket (by index) — same reasoning as `ColumnsViz`'s. */
	tickEvery?: number;
	/**
	 * The claim the chart is making, stated — same idea as `ColumnsViz.callout`, computed
	 * from the same rows the bars are drawn from so it can't drift when the catalog
	 * refreshes. Always about the LAST point (the most recent year): no `at` position like
	 * `ColumnsViz` needs, since "most recent" is unambiguous and always the rightmost column.
	 */
	callout?: { text: string };
}

/**
 * A point (median) plus a band (interquartile range) per discrete category. For a metric
 * where the shape of each category's distribution matters, not just its center — but the
 * categories themselves (player counts) are discrete, not points on a continuum, so drawing
 * this as a `line`/area (which implies something meaningful *between* x=3 and x=4) would be
 * wrong the way it wouldn't be for a year axis.
 */
export interface RangeViz {
	kind: 'range';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	/** One entry per category. `low`/`high` are the 25th/75th percentile — the "50% band" —
	 *  and `mid` is the median, drawn as the dot. Not a statistical confidence interval on the
	 *  mean: with thousands of games per category a true CI would be too narrow to read, so
	 *  this shows the actual spread of individual games' ratings instead. */
	points: { x: number; low: number; mid: number; high: number }[];
	/** Decimal places for the y-axis gridline labels — same reasoning as `ColumnsViz.precision`. */
	precision?: number;
}

/**
 * Overlapping distribution curves, one lane per group (a "ridgeline"/joyplot) — for comparing
 * the SHAPE of a metric's distribution across several groups at once, where a `columns`
 * histogram (one group at a time) or a `bars`/`dots` chart (one number per group) would each
 * lose either the shape or the side-by-side comparison.
 */
export interface RidgeViz {
	kind: 'ridge';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	/** Decimal places for the shared x-axis tick labels. */
	precision?: number;
	/**
	 * The shared x-axis (e.g. rating) grid points a KDE was evaluated at — every lane's
	 * `density` is indexed against this same array, so lanes overlay on one x-axis without
	 * per-lane interpolation in the renderer. NOT histogram bucket centers — there's no
	 * discretization here, just where along a continuous axis each lane's density was sampled.
	 */
	grid: number[];
	/**
	 * One lane per group, top to bottom in draw order. `density[i]` is the lane's actual KDE
	 * density at `grid[i]` (a real density estimate, not a normalized share) — a KDE
	 * integrates to 1 by construction, so a group with far more games produces a more
	 * statistically reliable curve rather than a taller one; comparing shape rather than
	 * volume falls out of that automatically. `n` is the lane's total game count, for context
	 * (e.g. a hover detail), not itself plotted. `median` is the lane's actual sample median.
	 */
	lanes: { label: string; n: number; density: number[]; median: number }[];
}

export type Viz = ScatterViz | ColumnsViz | BarsViz | LineViz | StackViz | RangeViz | RidgeViz;

export interface Featured {
	id: number;
	name: string;
	year: number | null;
	geek: number | null;
	weight: number | null;
	usersRated: number;
	/** BGG's CDN, so box art costs this app nothing to serve. */
	image: string | null;
	note: string;
}

export interface LandingContent {
	builtAt: string;
	stats: { games: number; newestYear: number };
	vizzes: Viz[];
	featured: Featured[];
}
