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

/**
 * Model output. Every game in this catalog carries its prediction — including games the
 * model was fitted on, which are not forecasts and must be readable as such. That
 * distinction belongs in a status flag on the prediction row, emitted by the scorer (which
 * knows which model version produced it); it is NOT yet in `bgg_predictions`, so the column
 * is absent here until the pipeline emits it. See docs/predictions-plan.md.
 *
 * This once said the Predictions view would need its own on-demand artifact, on the grounds
 * that upcoming games are a year-scoped population rather than a ratings-scoped one. It
 * doesn't: `WORKING_SET_WHERE` already admits every game published this year or later, so all
 * ~4,800 of them are in this artifact carrying all five model columns. The `upcoming`
 * universe is a `WHERE` over the catalog already in the browser, and cost nothing to add.
 *
 * Float32, not Float64. A predicted rating carries maybe three meaningful digits; storing
 * fifteen doubles the width of the five widest columns for no recoverable information.
 * Measured cost of carrying all five here: +128 KB gzipped, +2.9%.
 */
export const PREDICTION_COLUMNS = {
	predicted_hurdle_prob: 'float32',
	predicted_geek_rating: 'float32',
	predicted_rating: 'float32',
	predicted_complexity: 'float32',
	predicted_users_rated: 'int',
	/**
	 * `in_sample` / `out_of_sample`, emitted by the scorer from the model registration it
	 * loaded — never derived here, or it would silently go stale at the next refit.
	 *
	 * NULL is a third state and not the same as `out_of_sample`: 6,086 working-set games
	 * (including every upcoming one) carry a prediction from before the flag existed and
	 * self-heal through change detection. Anything reading this must treat NULL as "not yet
	 * known", not as a forecast.
	 */
	sample_status: 'string',
	/** The cutoff the scoring model was fitted through — makes the flag auditable, not a claim. */
	training_cutoff_year: 'int'
} as const;

export type PredictionName = keyof typeof PREDICTION_COLUMNS;
export const PREDICTION_NAMES = Object.keys(PREDICTION_COLUMNS) as PredictionName[];

/** Every scalar the Arrow schema carries, whichever table it came from. */
export const ALL_SCALAR_COLUMNS = { ...SCALAR_COLUMNS, ...PREDICTION_COLUMNS } as const;

export type ScalarKind = (typeof ALL_SCALAR_COLUMNS)[keyof typeof ALL_SCALAR_COLUMNS];
export type ScalarName = keyof typeof SCALAR_COLUMNS;

export const SCALAR_NAMES = Object.keys(SCALAR_COLUMNS) as ScalarName[];
export const ALL_SCALAR_NAMES = [...SCALAR_NAMES, ...PREDICTION_NAMES] as string[];

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
	...ALL_SCALAR_NAMES,
	...LIST_COLUMNS,
	...INT_LIST_COLUMNS
] as string[];

/**
 * Working set = established (rated ≥30) ∪ upcoming (current year or later). The current
 * year is computed in SQL (`CURRENT_DATE()`) so it's always right without depending on
 * the server's clock.
 */
/*
 * Alias-qualified: `bgg_predictions` carries its own `year_published`, so an unqualified
 * predicate became ambiguous the moment that table joined in.
 */
export const WORKING_SET_WHERE =
	'f.users_rated >= 30 OR f.year_published >= EXTRACT(YEAR FROM CURRENT_DATE())';

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
export function catalogQuerySql(
	featuresTable: string,
	bestPlayerCountsTable: string,
	predictionsTable: string
): string {
	const cols = [...SCALAR_NAMES, ...LIST_COLUMNS].map((c) => `f.${c}`).join(', ');
	// LEFT JOIN: `bgg_predictions` is year-filtered and holds one row per scored game, so a
	// missing row is the normal case and must not drop the game from the catalog.
	const preds = PREDICTION_NAMES.map((c) => `p.${c}`).join(', ');
	return `SELECT ${cols}, ${preds},
		${playerCountArray('best_player_counts')},
		${playerCountArray('recommended_player_counts')}
	FROM \`${featuresTable}\` f
	LEFT JOIN \`${bestPlayerCountsTable}\` bpc USING (game_id)
	LEFT JOIN \`${predictionsTable}\` p USING (game_id)
	WHERE ${WORKING_SET_WHERE}
	ORDER BY game_id`;
}
