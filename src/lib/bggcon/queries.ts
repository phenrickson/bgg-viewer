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
	/** Group by status: every copy out, some out, or none out. */
	status?: Status;
}

export type Status = 'out' | 'partial' | 'available';

const STATUS_SQL: Record<Status, string> = {
	out: 'l.copies - COALESCE(o.n, 0) <= 0',
	partial: 'COALESCE(o.n, 0) > 0 AND l.copies - COALESCE(o.n, 0) > 0',
	available: 'COALESCE(o.n, 0) = 0'
};

const AVAILABLE = 'l.copies - COALESCE(o.n, 0) > 0';
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
	if (a.status) parts.push(STATUS_SQL[a.status]);
	return (
		`FROM con_library l ${joinCatalog} LEFT JOIN con_checked_out o USING (game_id) ` +
		`LEFT JOIN thumbnails t USING (game_id) WHERE ${parts.length ? parts.join(' AND ') : 'TRUE'}`
	);
}

export function listSql(a: ListArgs & { offset: number; limit: number }): string {
	const then = a.mode === 'all' ? 'c.geek_rating DESC NULLS LAST' : 'lower(COALESCE(c.name, l.tte_name))';
	return (
		`SELECT l.game_id, COALESCE(c.name, l.tte_name) AS name, c.year_published, c.average_rating,
		        c.average_weight, c.min_players, c.max_players, c.min_playtime, c.max_playtime,
		        c.best_player_counts, c.recommended_player_counts,
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
