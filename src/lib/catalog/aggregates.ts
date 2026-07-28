/**
 * Overview aggregates — the SQL the Overview view runs against the in-browser DuckDB
 * catalog. Each builder takes an already-compiled, injection-safe WHERE body (from
 * `toWhere`) and returns a query over the *scoped* set, so every panel reflects the
 * current filters. Aggregation happens in DuckDB (not JS) — we pull back tens of rows,
 * never the whole set.
 */

/** One-row summary for the stat tiles. */
export interface Summary {
	total: number;
	upcoming: number; // in-scope games without a settled rating (users_rated < 25)
	median_weight: number | null;
	median_geek: number | null;
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
export interface Facet {
	c: string;
	n: number;
}
export interface ScatterPoint {
	x: number; // average_weight
	y: number; // average_rating
	name: string;
}

/** Width of the rating-distribution buckets, in rating points. */
export const RATING_BIN = 0.25;

/** Cap on scatter points drawn — SVG stays smooth; we take the most-rated games. */
export const SCATTER_LIMIT = 2000;

export const summarySql = (where: string): string =>
	`SELECT
	   COUNT(*)::INT AS total,
	   COUNT(*) FILTER (WHERE users_rated < 25)::INT AS upcoming,
	   median(average_weight) FILTER (WHERE average_weight > 0) AS median_weight,
	   median(geek_rating) FILTER (WHERE geek_rating > 0) AS median_geek,
	   min(year_published)::INT AS year_min,
	   max(year_published)::INT AS year_max
	 FROM catalog WHERE ${where}`;

/** Average-rating distribution, bucketed to RATING_BIN. */
export const ratingHistogramSql = (where: string): string =>
	`SELECT (floor(average_rating / ${RATING_BIN}) * ${RATING_BIN}) AS bucket, COUNT(*)::INT AS n
	 FROM catalog WHERE ${where} AND average_rating > 0
	 GROUP BY bucket ORDER BY bucket`;

/**
 * Floor for the games-per-year chart. BGG entries for ancient/public-domain games
 * carry historical years (Go = -2200, Chess = 1475, …) that stretch a band axis and
 * crush the modern era into a sliver — the hobby's distribution starts ~1900.
 */
export const YEAR_FLOOR = 1900;

/** Count of games per publication year since YEAR_FLOOR (nulls/ancient years dropped). */
export const gamesPerYearSql = (where: string): string =>
	`SELECT year_published AS year, COUNT(*)::INT AS n
	 FROM catalog WHERE ${where} AND year_published >= ${YEAR_FLOOR}
	 GROUP BY year ORDER BY year`;

/** Complexity (average_weight) vs average rating, for the most-rated games in scope. */
export const scatterSql = (where: string, limit = SCATTER_LIMIT): string =>
	`SELECT average_weight AS x, average_rating AS y, name
	 FROM catalog WHERE ${where} AND average_weight > 0 AND average_rating > 0
	 ORDER BY users_rated DESC LIMIT ${limit}`;

/**
 * Top facet values within scope. `col` is a fixed identifier (categories/mechanics/
 * families), never user input — UNNEST must live in a subquery before GROUP BY.
 */
export const topFacetSql = (where: string, col: 'categories' | 'mechanics' | 'families', limit = 12): string =>
	`SELECT c, COUNT(*)::INT AS n
	 FROM (SELECT UNNEST(${col}) AS c FROM catalog WHERE ${where})
	 GROUP BY c ORDER BY n DESC LIMIT ${limit}`;
