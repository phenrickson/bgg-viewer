/**
 * Set filters: membership in a list of games that lives outside `Scope`, applied by wrapping a
 * `where` string. Today that's the owned collection and the BGG.CON library (with "available
 * now"). Pure SQL text, so it's testable; `catalog.svelte.ts` owns the tables and the state.
 *
 * Injection-safe by construction: the clauses are fixed strings, and the VALUES builders
 * coerce every value to an integer or boolean, or escape it as a SQL string literal.
 */
export interface SetFilterState {
	collection: boolean;
	library: boolean;
	availableOnly: boolean;
}

/** Library games with at least one copy not checked out. */
export const AVAILABLE_SQL =
	'SELECT l.game_id FROM con_library l LEFT JOIN con_checked_out o USING (game_id) WHERE l.copies - COALESCE(o.n, 0) > 0';

export function withSetFilters(where: string, s: SetFilterState): string {
	let w = where;
	if (s.collection) w += ' AND game_id IN (SELECT game_id FROM owned_collection)';
	if (s.library) {
		w += s.availableOnly
			? ` AND game_id IN (${AVAILABLE_SQL})`
			: ' AND game_id IN (SELECT game_id FROM con_library)';
	}
	return w;
}

const int = (n: number) => (Number.isFinite(n) ? Math.trunc(n) : null);

export interface LibraryRow {
	bgg_id: number;
	name: string;
	copies: number;
	play_to_win: boolean;
}

/** A SQL string literal: single quotes doubled, so text can't end the string early. */
const str = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * `(game_id, tte_name, copies, play_to_win)` tuples for `INSERT INTO con_library VALUES …`.
 * `tte_name` (not `name`) so a join with `catalog` never has two `name` columns.
 */
export function libraryValues(rows: LibraryRow[]): string {
	return rows
		.map((r) => [int(r.bgg_id), r.name, int(r.copies), r.play_to_win ? 'TRUE' : 'FALSE'] as const)
		.filter(([id, , copies]) => id != null && copies != null)
		.map(([id, name, copies, ptw]) => `(${id}, ${str(name)}, ${copies}, ${ptw})`)
		.join(', ');
}

/** `(game_id, n)` pairs for `INSERT INTO con_checked_out VALUES …`. */
export function checkedOutValues(counts: Record<number, number>): string {
	return Object.entries(counts)
		.map(([id, n]) => [int(Number(id)), int(n)] as const)
		.filter(([id, n]) => id != null && n != null)
		.map(([id, n]) => `(${id}, ${n})`)
		.join(', ');
}

/**
 * Replace `con_checked_out` in ONE statement. As a create-then-insert pair, two refreshes that
 * overlapped both inserted into the same fresh table, listing every checked-out game twice.
 */
export function checkedOutSql(counts: Record<number, number>): string {
	const values = checkedOutValues(counts);
	return values
		? `CREATE OR REPLACE TABLE con_checked_out AS SELECT * FROM (VALUES ${values}) v(game_id, n)`
		: 'CREATE OR REPLACE TABLE con_checked_out (game_id INTEGER, n INTEGER)';
}
