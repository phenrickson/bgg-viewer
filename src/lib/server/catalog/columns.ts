/**
 * The narrow catalog shape — everything the client needs to filter, aggregate, and
 * search the working set in-browser, without the heavy fields (description/image).
 * Scalars, string-list facet columns, and integer-list player-count columns. This one
 * definition drives both the BigQuery SELECT and the Arrow schema, so the two can't drift.
 */
export const SCALAR_COLUMNS = {
	game_id: 'int',
	name: 'string',
	year_published: 'int',
	geek_rating: 'float',
	average_rating: 'float',
	average_weight: 'float',
	users_rated: 'int',
	min_players: 'int',
	max_players: 'int'
} as const;

export type ScalarKind = (typeof SCALAR_COLUMNS)[keyof typeof SCALAR_COLUMNS];
export type ScalarName = keyof typeof SCALAR_COLUMNS;

export const SCALAR_NAMES = Object.keys(SCALAR_COLUMNS) as ScalarName[];

/** String-list facets — `list_contains()`-able in DuckDB. Sourced from games_features arrays. */
export const LIST_COLUMNS = [
	'categories',
	'mechanics',
	'families',
	'designers',
	'artists',
	'publishers'
] as const;

/**
 * Integer-list player-count columns: the player counts a game is *best at* / *recommended
 * at* (derived, per game). This is the flagship searchable feature BGG can't do. Sourced
 * from `best_player_counts` (comma-strings → INT arrays in the build query).
 */
export const INT_LIST_COLUMNS = ['best_player_counts', 'recommended_player_counts'] as const;

export const ALL_COLUMN_NAMES = [
	...SCALAR_NAMES,
	...LIST_COLUMNS,
	...INT_LIST_COLUMNS
] as string[];

/**
 * Working set = established (rated ≥30) ∪ upcoming (current year or later). The current
 * year is computed in SQL (`CURRENT_DATE()`) so it's always right without depending on
 * the server's clock.
 */
export const WORKING_SET_WHERE =
	'users_rated >= 30 OR year_published >= EXTRACT(YEAR FROM CURRENT_DATE())';

/** Comma-string (e.g. "2, 4") → `ARRAY<INT64>`; NULL/blank → `[]`. */
function playerCountArray(col: string): string {
	return `ARRAY(
			SELECT SAFE_CAST(TRIM(x) AS INT64)
			FROM UNNEST(SPLIT(bpc.${col}, ',')) AS x
			WHERE TRIM(x) != ''
		) AS ${col}`;
}

/**
 * The full catalog query. Scalars + string-list facets come from `games_features` (`f`);
 * the best/recommended player-count arrays are parsed from `best_player_counts` (`bpc`).
 * `ORDER BY game_id` makes row order deterministic, so identical data serializes to
 * identical bytes — keeping the content-hash version (ETag) stable across rebuilds.
 */
export function catalogQuerySql(featuresTable: string, bestPlayerCountsTable: string): string {
	const cols = [...SCALAR_NAMES, ...LIST_COLUMNS].map((c) => `f.${c}`).join(', ');
	return `SELECT ${cols},
		${playerCountArray('best_player_counts')},
		${playerCountArray('recommended_player_counts')}
	FROM \`${featuresTable}\` f
	LEFT JOIN \`${bestPlayerCountsTable}\` bpc USING (game_id)
	WHERE ${WORKING_SET_WHERE}
	ORDER BY game_id`;
}
