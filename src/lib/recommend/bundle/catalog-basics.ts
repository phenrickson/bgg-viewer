/**
 * The catalog columns another site needs to name and describe games next to the vectors:
 * search by name, and the basics on an "anywhere" result card. Read with plain
 * `apache-arrow` from the catalog artifact (`$lib/server/catalog/columns.ts` defines it), so
 * a site without DuckDB can use it. Part of the `BggRank` bundle (`./index.ts`).
 */
import { tableFromIPC, type Table } from 'apache-arrow';
import { DIMS, type VectorSet } from '../vectors';

export interface Catalog {
	ids: Int32Array;
	name: string[];
	year: (number | null)[];
	usersRated: Int32Array;
	minPlayers: (number | null)[];
	maxPlayers: (number | null)[];
	minPlaytime: (number | null)[];
	maxPlaytime: (number | null)[];
	weight: (number | null)[];
	geekRating: (number | null)[];
	averageRating: (number | null)[];
	/** game_id → row. */
	index: Map<number, number>;
}

function nullable(table: Table, name: string): (number | null)[] {
	const col = table.getChild(name);
	if (!col) throw new Error(`catalog artifact is missing column ${name}`);
	const out = new Array<number | null>(table.numRows);
	for (let i = 0; i < table.numRows; i++) out[i] = (col.get(i) as number | null) ?? null;
	return out;
}

/** Parse the catalog artifact's Arrow IPC bytes into the columns the bundle exposes. */
export function readCatalog(bytes: Uint8Array): Catalog {
	const table = tableFromIPC(bytes);
	const n = table.numRows;
	const idCol = table.getChild('game_id');
	const nameCol = table.getChild('name');
	if (!idCol || !nameCol) throw new Error('catalog artifact is missing game_id or name');
	const ids = Int32Array.from(idCol.toArray() as ArrayLike<number>);
	const name = new Array<string>(n);
	for (let i = 0; i < n; i++) name[i] = (nameCol.get(i) as string | null) ?? '';
	const usersRated = Int32Array.from(nullable(table, 'users_rated').map((x) => x ?? 0));
	const index = new Map<number, number>();
	for (let i = 0; i < n; i++) index.set(ids[i], i);
	return {
		ids,
		name,
		year: nullable(table, 'year_published'),
		usersRated,
		minPlayers: nullable(table, 'min_players'),
		maxPlayers: nullable(table, 'max_players'),
		minPlaytime: nullable(table, 'min_playtime'),
		maxPlaytime: nullable(table, 'max_playtime'),
		weight: nullable(table, 'average_weight'),
		geekRating: nullable(table, 'geek_rating'),
		averageRating: nullable(table, 'average_rating'),
		index
	};
}

const STYLES = ['similar', 'recommender', 'sicko'];

/**
 * Refuse a vectors artifact this bundle can't rank correctly. Checks shape, not
 * `embedding_version`: that is the model's version and moves on every retrain without the
 * file changing shape.
 */
export function checkVectors(v: VectorSet): void {
	const names = new Set(v.profiles.map((p) => p.name));
	if (v.vec.length !== v.ids.length * DIMS || !STYLES.every((s) => names.has(s))) {
		throw new Error('unsupported vectors artifact');
	}
}
