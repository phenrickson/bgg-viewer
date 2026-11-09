/**
 * Vectors rows → Arrow IPC, the shape `$lib/recommend/vectors.ts` reads.
 *
 * Columns: `game_id` Int32, `embedding` FixedSizeList<Float32, 64>, `complexity` Float32,
 * `users_rated` Int32, `geek_pct` Float32, `line` Int32 (null = no product line).
 * Schema metadata: the latest `embedding_version`, the `embedding_model`, `dims`, and the
 * `similarity_profiles` rows as JSON — the rules the browser ranks with.
 *
 * Unlike coordinates, rows from more than one embedding version are allowed: `game_neighbors`
 * compares across them, and matching it exactly is the bar (the build script logs how many).
 * Float32, not int8: int8 reordered 11 of 15 test lists.
 */
import {
	Table,
	vectorFromArray,
	tableToIPC,
	makeData,
	makeVector,
	Int32,
	Float32,
	FixedSizeList,
	Field,
	Schema,
	type Vector
} from 'apache-arrow';

export const DIMS = 64;

export const META_VERSION = 'embedding_version';
export const META_MODEL = 'embedding_model';
export const META_PROFILES = 'similarity_profiles';
export const META_DIMS = 'dims';

export type VectorRow = {
	game_id: unknown;
	embedding: number[];
	complexity: number | null;
	users_rated: unknown;
	geek_pct: number | null;
	line: unknown;
	embedding_version: unknown;
	embedding_model: string;
};

/** One row of `analytics.similarity_profiles`. */
export type ProfileRow = {
	name: string;
	weight: number;
	complexity_band: number | null;
	max_per_family: number | null;
	min_similarity: number;
	min_rating_pct: number;
	max_rating_pct: number;
	min_users_rated: number;
	source_min_users_rated: number;
	top_k: number;
	dims: number;
	distance: string;
};

/** BigQuery hands INT64 back as `{ value: '…' }`. */
function num(v: unknown): number {
	if (typeof v === 'object' && v !== null && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

export function rowsToArrowIPC(rows: VectorRow[], profiles: ProfileRow[]): Uint8Array {
	const flat = new Float32Array(rows.length * DIMS);
	rows.forEach((r, i) => {
		if (r.embedding?.length !== DIMS) {
			throw new Error(`game ${num(r.game_id)} has a ${r.embedding?.length}-wide embedding, expected ${DIMS}`);
		}
		flat.set(r.embedding, i * DIMS);
	});

	const listType = new FixedSizeList(DIMS, new Field('item', new Float32(), false));
	const child = makeData({ type: new Float32(), length: flat.length, data: flat });
	const embedding = makeVector(makeData({ type: listType, length: rows.length, nullCount: 0, child }));

	const columns: Record<string, Vector> = {
		game_id: vectorFromArray(rows.map((r) => num(r.game_id)), new Int32()),
		embedding,
		complexity: vectorFromArray(rows.map((r) => (r.complexity == null ? NaN : Number(r.complexity))), new Float32()),
		users_rated: vectorFromArray(rows.map((r) => num(r.users_rated)), new Int32()),
		geek_pct: vectorFromArray(rows.map((r) => Number(r.geek_pct ?? 0)), new Float32()),
		line: vectorFromArray(rows.map((r) => (r.line == null ? null : num(r.line))), new Int32())
	};

	const versions = rows.map((r) => num(r.embedding_version)).filter(Number.isFinite);
	const bare = new Table(columns);
	const metadata = new Map<string, string>([
		[META_VERSION, versions.length ? String(Math.max(...versions)) : ''],
		[META_MODEL, rows[0]?.embedding_model ?? ''],
		[META_DIMS, String(DIMS)],
		[META_PROFILES, JSON.stringify(profiles)]
	]);
	const schema = new Schema(
		bare.schema.fields.map((f) => new Field(f.name, f.type, f.nullable)),
		metadata
	);
	return tableToIPC(new Table(schema, bare.batches), 'stream');
}
