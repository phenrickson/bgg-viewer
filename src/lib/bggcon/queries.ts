/**
 * The /bggcon dashboard's SQL over DuckDB: `con_library` (games, Tabletop.Events names, copies),
 * `con_checked_out` (copies out per game), the `catalog` and `thumbnails`. Pure text, tested.
 *
 * - **all**: catalog-matched library games, filtered by Explore's own scope `where`.
 * - **focus**: the starred games, including any the catalog lacks.
 * - **missing**: library games the catalog lacks (below its ratings cutoff), searchable by name.
 *
 * Every list puts games with a copy on the shelf first. Numbers are coerced to integers and
 * the one free-text value (`q`) is escaped, so nothing user-typed reaches the SQL raw.
 */
export type Mode = 'all' | 'focus' | 'missing';

export interface ListArgs {
	mode: Mode;
	/** The scope `where` (Explore's `toWhere`), for `all`. */
	where?: string;
	/** Starred BGG ids, for `focus`. */
	ids?: number[];
	/** Name search, for `missing` (the catalog-backed modes search through `where`). */
	q?: string;
	availableOnly: boolean;
	/** Only games with at least one copy checked out. */
	inUseOnly?: boolean;
}

const AVAILABLE = 'l.copies - COALESCE(o.n, 0) > 0';
const IN_USE = 'COALESCE(o.n, 0) > 0';
const int = (n: number) => Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
const likeText = (s: string) => s.replace(/'/g, "''").replace(/[%_\\]/g, (c) => `\\${c}`);

function fromWhere(a: ListArgs): string {
	const parts: string[] = [];
	let joinCatalog = 'LEFT JOIN catalog c USING (game_id)';
	if (a.mode === 'all') {
		joinCatalog = 'JOIN catalog c USING (game_id)';
		if (a.where) parts.push(a.where);
	} else if (a.mode === 'focus') {
		const ids = (a.ids ?? []).filter(Number.isFinite).map((n) => Math.trunc(n));
		parts.push(ids.length ? `l.game_id IN (${ids.join(', ')})` : 'FALSE');
	} else {
		parts.push('l.game_id NOT IN (SELECT game_id FROM catalog)');
		if (a.q?.trim()) parts.push(`l.tte_name ILIKE '%${likeText(a.q.trim())}%' ESCAPE '\'`);
	}
	if (a.availableOnly) parts.push(AVAILABLE);
	if (a.inUseOnly) parts.push(IN_USE);
	return (
		`FROM con_library l ${joinCatalog} LEFT JOIN con_checked_out o USING (game_id) ` +
		`LEFT JOIN thumbnails t USING (game_id) WHERE ${parts.length ? parts.join(' AND ') : 'TRUE'}`
	);
}

export function listSql(a: ListArgs & { offset: number; limit: number }): string {
	const then = a.mode === 'all' ? 'c.geek_rating DESC NULLS LAST' : 'lower(COALESCE(c.name, l.tte_name))';
	return (
		`SELECT l.game_id, COALESCE(c.name, l.tte_name) AS name, c.year_published, NULLIF(c.average_rating, 0) AS average_rating,
		        NULLIF(c.geek_rating, 0) AS geek_rating, NULLIF(c.average_weight, 0) AS average_weight,
		        c.best_player_counts, c.recommended_player_counts, c.min_players, c.max_players, c.min_playtime, c.max_playtime,
		        t.thumbnail, l.copies, l.play_to_win, (l.copies - COALESCE(o.n, 0))::INT AS available,
		        (c.name IS NOT NULL) AS in_catalog ` +
		`${fromWhere(a)} ORDER BY (${AVAILABLE}) DESC, ${then}, l.game_id ` +
		`LIMIT ${int(a.limit)} OFFSET ${int(a.offset)}`
	);
}

export function countSql(a: ListArgs): string {
	return `SELECT COUNT(*)::INT AS n ${fromWhere(a)}`;
}

/** The header: games in the library, games with a copy on the shelf, copies out, not in catalog. */
export function countsSql(): string {
	return `SELECT COUNT(*)::INT AS games,
	               COUNT(*) FILTER (WHERE ${AVAILABLE})::INT AS on_shelf,
	               COALESCE(SUM(o.n), 0)::INT AS copies_out,
	               COUNT(*) FILTER (WHERE l.game_id NOT IN (SELECT game_id FROM catalog))::INT AS not_in_catalog
	        FROM con_library l LEFT JOIN con_checked_out o USING (game_id)`;
}

export interface LibraryListRow {
	game_id: number;
	name: string;
	year_published: number | null;
	average_rating: number | null;
	geek_rating: number | null;
	average_weight: number | null;
	min_players: number | null;
	max_players: number | null;
	min_playtime: number | null;
	max_playtime: number | null;
	best_player_counts: number[] | null;
	recommended_player_counts: number[] | null;
	thumbnail: string | null;
	copies: number;
	play_to_win: boolean;
	available: number;
	in_catalog: boolean;
}

/**
 * The library as Explore's table (`GameList`) reads it: catalog games joined to the library and
 * to what's checked out. `GameList` queries `catalog c`, so these add the library's columns and
 * the `where` for a view. Games the catalog lacks aren't in it; the "Not in catalog" view keeps
 * its own list.
 */
export const LIBRARY_JOIN = 'JOIN con_library l USING (game_id) LEFT JOIN con_checked_out o USING (game_id)';
export const LIBRARY_SELECT =
	'c.min_playtime, c.max_playtime, l.copies, l.play_to_win, ' +
	'(l.copies - COALESCE(o.n, 0))::INT AS available, TRUE AS in_catalog';
/** Sorts the Availability column on whether a copy is available. */
export const AVAILABLE_SORT = '(l.copies - COALESCE(o.n, 0) > 0)';

export function tableWhere(a: ListArgs): string {
	const parts: string[] = [];
	if (a.mode === 'focus') {
		const ids = (a.ids ?? []).filter(Number.isFinite).map((n) => Math.trunc(n));
		parts.push(ids.length ? `l.game_id IN (${ids.join(', ')})` : 'FALSE');
	} else {
		parts.push(a.where || 'TRUE');
	}
	if (a.availableOnly) parts.push(AVAILABLE);
	if (a.inUseOnly) parts.push(IN_USE);
	return parts.join(' AND ');
}
