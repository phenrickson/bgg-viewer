/**
 * The narrow catalog shape — everything the client needs to filter, aggregate, and
 * search the working set, without the heavy fields (description/image). Scalars plus
 * three string-list facet columns. This one definition drives both the BigQuery SELECT
 * and the Arrow schema, so the two can't drift.
 */
export const SCALAR_COLUMNS = {
	game_id: 'int',
	name: 'string',
	year_published: 'int',
	geek_rating: 'float',
	average_rating: 'float',
	average_weight: 'float',
	complexity: 'float',
	users_rated: 'int',
	min_players: 'int',
	max_players: 'int'
} as const;

export type ScalarKind = (typeof SCALAR_COLUMNS)[keyof typeof SCALAR_COLUMNS];
export type ScalarName = keyof typeof SCALAR_COLUMNS;

export const SCALAR_NAMES = Object.keys(SCALAR_COLUMNS) as ScalarName[];
export const LIST_COLUMNS = ['categories', 'mechanics', 'families'] as const;
export const ALL_COLUMN_NAMES = [...SCALAR_NAMES, ...LIST_COLUMNS] as string[];

/**
 * Working set = established (rated ≥30) ∪ upcoming (current year or later). The current
 * year is computed in SQL (`CURRENT_DATE()`) so it's always right without depending on
 * the server's clock.
 */
export const WORKING_SET_WHERE =
	'users_rated >= 30 OR year_published >= EXTRACT(YEAR FROM CURRENT_DATE())';

/**
 * The full catalog query against a fully-qualified `project.dataset.table`.
 * `ORDER BY game_id` makes row order deterministic, so identical data serializes to
 * identical bytes — keeping the content-hash version (ETag) stable across rebuilds.
 */
export function catalogQuerySql(table: string): string {
	return `SELECT ${ALL_COLUMN_NAMES.join(', ')} FROM \`${table}\` WHERE ${WORKING_SET_WHERE} ORDER BY game_id`;
}
