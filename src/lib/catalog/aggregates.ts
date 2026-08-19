/**
 * Overview aggregates — the SQL the Overview view runs against the in-browser DuckDB
 * catalog. Each builder takes an already-compiled, injection-safe WHERE body (from
 * `toWhere`) and returns a query over the *scoped* set, so every panel reflects the
 * current filters. Aggregation happens in DuckDB (not JS) — we pull back tens of rows,
 * never the whole set.
 *
 * Every builder that reads a measure also takes the universe's column map, because the
 * `upcoming` universe reads the model's estimates where the rated slices read what
 * happened — a game nobody has played has no `average_weight` to bucket. Same shapes, same
 * bins, different source; see `columnsFor` in `scope.ts`. The parameter defaults to the
 * rated columns so existing callers are unaffected.
 */
import { columnsFor, type Scope } from './scope';

export type MeasureColumns = ReturnType<typeof columnsFor>;
const RATED: MeasureColumns = columnsFor('top10k');
export const measures = (universe: Scope['universe']): MeasureColumns => columnsFor(universe);

/** One-row summary for the stat tiles. */
export interface Summary {
	total: number;
	upcoming: number; // in-scope games without a settled rating (users_rated < 30)
	median_weight: number | null;
	median_geek: number | null;
	median_rating: number | null;
	median_users_rated: number | null;
	median_year: number | null;
	year_min: number | null;
	year_max: number | null;
}

export interface Bin {
	bucket: number;
	n: number;
}
export interface YearCount {
	year: number;
	n: number;
}
export interface PlayerCountBin {
	count: number;
	n: number;
}
export interface Facet {
	c: string;
	n: number;
}
export interface ScatterPoint {
	x: number; // average_weight (or average_rating, for the popularity plot)
	y: number; // average_rating (or users_rated)
	game_id: number; // the point's game — its name is resolved via the catalog's id→name map,
	// never re-marshaled as a string column on every filter change (see catalog `nameOf`).
}

/** Width of the rating-distribution buckets, in rating points. */
export const RATING_BIN = 0.25;

/**
 * Defensive cap on scatter points. The scatters render every point in scope on a Canvas
 * layer, which handles the full working set (~33k) smoothly. This limit only guards
 * against a pathologically large scope (e.g. a future kitchen-sink mode); it never bites
 * the normal working set.
 */
export const SCATTER_LIMIT = 60000;

/**
 * Floor for anything keyed on publication year. BGG entries for ancient/public-domain
 * games carry historical years (Go = -2200, Chess = 1475, …) that stretch an axis and
 * crush the modern era into a sliver — the hobby's distribution starts ~1900.
 */
export const YEAR_FLOOR = 1900;

/**
 * Where the year *chart* starts. The hobby's long pre-modern tail (a handful of games per
 * year back to 1900) would eat half the axis for a fraction of a percent of the set and
 * crush the era anyone is browsing. The year filter itself is unbounded — only the drawn
 * domain, and the median-year headline, are floored.
 */
export const YEAR_DISPLAY_FLOOR = 1970;

export const summarySql = (where: string, m: MeasureColumns = RATED): string =>
	`SELECT
	   COUNT(*)::INT AS total,
	   COUNT(*) FILTER (WHERE users_rated < 30)::INT AS upcoming,
	   median(${m.weight}) FILTER (WHERE ${m.weight} > 0) AS median_weight,
	   median(${m.geek}) FILTER (WHERE ${m.geek} > 0) AS median_geek,
	   median(${m.rating}) FILTER (WHERE ${m.rating} > 0) AS median_rating,
	   median(${m.usersRated}) FILTER (WHERE ${m.usersRated} > 0) AS median_users_rated,
	   -- median, not min/max: BGG carries public-domain games at historical years (Go at
	   -- -2200) that make a printed span nonsense. The median reads as "this set's era".
	   median(year_published) FILTER (WHERE year_published >= ${YEAR_DISPLAY_FLOOR}) AS median_year,
	   min(year_published)::INT AS year_min,
	   max(year_published)::INT AS year_max
	 FROM catalog WHERE ${where}`;

/** Average-rating distribution, bucketed to RATING_BIN. */
export const ratingHistogramSql = (where: string, m: MeasureColumns = RATED): string =>
	`SELECT (floor(${m.rating} / ${RATING_BIN}) * ${RATING_BIN}) AS bucket, COUNT(*)::INT AS n
	 FROM catalog WHERE ${where} AND ${m.rating} > 0
	 GROUP BY bucket ORDER BY bucket`;

/** Width of the complexity-distribution buckets, in weight points (1–5 scale). */
export const WEIGHT_BIN = 0.25;

/** Complexity (average_weight) distribution, bucketed to WEIGHT_BIN. */
export const complexityHistogramSql = (where: string, m: MeasureColumns = RATED): string =>
	`SELECT (floor(${m.weight} / ${WEIGHT_BIN}) * ${WEIGHT_BIN}) AS bucket, COUNT(*)::INT AS n
	 FROM catalog WHERE ${where} AND ${m.weight} > 0
	 GROUP BY bucket ORDER BY bucket`;

/**
 * Bucket width for the ratings-count histogram, **in powers of ten** — ten bins per decade.
 * Ratings counts run from 30 to ~130,000, so a linear axis would pile 90% of the catalog into
 * the leftmost bar and tell you nothing. Binning on log10 turns it into a readable curve, and
 * the chart stays linear: it is the *data* that is log-scaled, not the component.
 */
export const RATINGS_LOG_BIN = 0.1;

/** Ratings-count (`users_rated`) distribution, bucketed on log10. Buckets are log values. */
export const ratingsCountHistogramSql = (where: string, m: MeasureColumns = RATED): string =>
	`SELECT (floor(log10(${m.usersRated}) / ${RATINGS_LOG_BIN}) * ${RATINGS_LOG_BIN}) AS bucket,
	        COUNT(*)::INT AS n
	 FROM catalog WHERE ${where} AND ${m.usersRated} > 0
	 GROUP BY bucket ORDER BY bucket`;

/**
 * Best-at player-count distribution — how many games in scope are community-voted "best
 * at" each player count. The differentiating aggregate: it visualizes the thing BGG can't.
 * best_player_counts is an INT array; UNNEST must live in a subquery before GROUP BY.
 */
export const bestAtDistributionSql = (where: string): string =>
	`SELECT v AS count, COUNT(*)::INT AS n
	 FROM (SELECT UNNEST(best_player_counts) AS v FROM catalog WHERE ${where})
	 WHERE v BETWEEN 1 AND 8
	 GROUP BY v ORDER BY v`;

/** Count of games per publication year since `floor` (nulls/ancient years dropped). */
export const gamesPerYearSql = (where: string, floor = YEAR_FLOOR): string =>
	`SELECT year_published AS year, COUNT(*)::INT AS n
	 FROM catalog WHERE ${where} AND year_published >= ${floor}
	 GROUP BY year ORDER BY year`;

/**
 * Complexity (average_weight) vs average rating — every game in scope.
 * Numbers only (x, y, game_id) — the `name` string is deliberately NOT selected, so a filter
 * change marshals near-zero-copy typed arrays, not tens of thousands of strings. The tooltip
 * resolves the hovered point's name via the catalog `id→name` map (`nameOf`).
 */
export const scatterSql = (where: string, limit = SCATTER_LIMIT, m: MeasureColumns = RATED): string =>
	`SELECT ${m.weight} AS x, ${m.rating} AS y, game_id
	 FROM catalog WHERE ${where} AND ${m.weight} > 0 AND ${m.rating} > 0
	 LIMIT ${limit}`;

/** Average rating vs popularity (users_rated) — y is log-scaled in the chart; every game in scope.
 * Numbers only (see `scatterSql`); name resolved via `nameOf`. */
export const popularitySql = (where: string, limit = SCATTER_LIMIT, m: MeasureColumns = RATED): string =>
	`SELECT ${m.rating} AS x, ${m.usersRated} AS y, game_id
	 FROM catalog WHERE ${where} AND ${m.rating} > 0 AND ${m.usersRated} > 0
	 LIMIT ${limit}`;

/**
 * Same shape as `scatterSql`/`popularitySql`, but plotted against the WIDER `baseWhere`
 * population (the universe with the active filters stripped — same idea as the Shape Strip's
 * comparison population) with a `selected` flag marking which of those rows also satisfy the
 * narrower `where`. Lets a chart show the whole universe as a faded backdrop with the current
 * filters highlighted on top — where does this selection sit in the bigger picture — rather
 * than only ever drawing the narrowed set with no context for what it was narrowed from.
 */
export const scatterSelectionSql = (
	baseWhere: string,
	selectedWhere: string,
	limit = SCATTER_LIMIT,
	m: MeasureColumns = RATED
): string =>
	`SELECT ${m.weight} AS x, ${m.rating} AS y, game_id, (${selectedWhere}) AS selected
	 FROM catalog WHERE ${baseWhere} AND ${m.weight} > 0 AND ${m.rating} > 0
	 LIMIT ${limit}`;

/** `popularitySql`'s counterpart to `scatterSelectionSql` — see its doc comment. */
export const popularitySelectionSql = (
	baseWhere: string,
	selectedWhere: string,
	limit = SCATTER_LIMIT,
	m: MeasureColumns = RATED
): string =>
	`SELECT ${m.rating} AS x, ${m.usersRated} AS y, game_id, (${selectedWhere}) AS selected
	 FROM catalog WHERE ${baseWhere} AND ${m.rating} > 0 AND ${m.usersRated} > 0
	 LIMIT ${limit}`;

/**
 * Popularity × rating × geek rating — the three-variable version of `popularitySql`, for the
 * About page's plot of how the Bayesian adjustment behaves. Carrying `geek_rating` as a third
 * column is the whole point: it is what shows a sparsely-rated 9.0 being pulled back toward
 * the middle, which neither axis alone can say.
 */
export const popularityRatingGeekSql = (where: string, limit = SCATTER_LIMIT): string =>
	`SELECT average_rating AS x, users_rated AS y, geek_rating AS c
	 FROM catalog
	 WHERE ${where} AND users_rated > 0 AND average_rating > 0 AND geek_rating > 0
	 LIMIT ${limit}`;

/**
 * Facet values *within the current scope*, optionally narrowed by a typed term — what the
 * rail's category/mechanic lists show, and (unfiltered, `term = ''`) the analysis panel's
 * ranked bar charts. Scope-aware counts mean the lists answer "what else is in this set" as
 * you filter. `col` is a fixed identifier from our own code; `term` is user input, so it is
 * escaped. Every column here is an array column in the artifact, so one query shape covers
 * all six.
 */
export const facetSearchSql = (
	where: string,
	col: 'categories' | 'mechanics' | 'families' | 'designers' | 'artists' | 'publishers',
	term = '',
	limit = 60
): string => {
	const t = term.trim().replace(/'/g, "''");
	const match = t ? ` WHERE c ILIKE '%${t}%'` : '';
	return `SELECT c, COUNT(*)::INT AS n
	 FROM (SELECT UNNEST(${col}) AS c FROM catalog WHERE ${where})${match}
	 GROUP BY c ORDER BY n DESC, c LIMIT ${limit}`;
};
