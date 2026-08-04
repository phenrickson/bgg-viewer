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
}

export type Viz = ScatterViz | ColumnsViz | BarsViz;

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
