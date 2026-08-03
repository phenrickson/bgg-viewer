/**
 * Shapes for the landing page's warm-gap content — the viz and the game shown while the
 * catalog loads into DuckDB.
 *
 * This content is *baked*, not queried at runtime. The whole point is that it renders with
 * the page: the gap it fills starts the moment the landing page is done, so anything that
 * needed a round-trip to appear would arrive after the problem it solves.
 */

/** A scatter's points are `[x, y]` pairs rather than objects — halves the JSON. */
export interface ScatterViz {
	kind: 'scatter';
	title: string;
	note: string;
	xLabel: string;
	yLabel: string;
	points: [number, number][];
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
