/**
 * Client reader for `/api/vectors`: every working-set game's 64-d embedding, ranking columns,
 * and the similarity profiles — what Recommend's shelf pools rank with in the browser
 * (`./rank.ts`). Plain `apache-arrow`, no DuckDB, like `$lib/map/coordinates.ts`.
 * Spec: docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md §1–2.
 *
 * Vectors are L2-normalised on the way in, so cosine similarity is a dot product.
 */
import { tableFromIPC, type Table } from 'apache-arrow';
import { fetchArtifactBytes } from '$lib/catalog/artifact-fetch';

export const DIMS = 64;

/** One `analytics.similarity_profiles` row — the rules `game_neighbors` ranks by. */
export interface Profile {
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
}

export interface VectorSet {
	ids: Int32Array;
	/** n × DIMS, each row unit length. */
	vec: Float32Array;
	complexity: Float32Array;
	usersRated: Int32Array;
	geekPct: Float32Array;
	/** Product line id; -1 = none. */
	line: Int32Array;
	/** game_id → row. */
	index: Map<number, number>;
	profiles: Profile[];
	version: number;
	model: string;
}

function column(table: Table, name: string) {
	const col = table.getChild(name);
	if (!col) throw new Error(`vectors artifact is missing column ${name}`);
	return col;
}

/** Parse the Arrow IPC bytes `/api/vectors` serves. */
export function parseVectors(buf: Uint8Array): VectorSet {
	const table = tableFromIPC(buf);
	const n = table.numRows;
	const ids = Int32Array.from(column(table, 'game_id').toArray() as ArrayLike<number>);
	const complexity = Float32Array.from(column(table, 'complexity').toArray() as ArrayLike<number>);
	const usersRated = Int32Array.from(column(table, 'users_rated').toArray() as ArrayLike<number>);
	const geekPct = Float32Array.from(column(table, 'geek_pct').toArray() as ArrayLike<number>);
	const lineCol = column(table, 'line');
	const line = new Int32Array(n);
	for (let i = 0; i < n; i++) line[i] = (lineCol.get(i) as number | null) ?? -1;

	// The embedding is FixedSizeList<Float32, 64>: its child values are the flat n × 64 floats,
	// batch by batch.
	const vec = new Float32Array(n * DIMS);
	let row = 0;
	for (const data of column(table, 'embedding').data) {
		const values = data.children[0].values as Float32Array;
		for (let r = 0; r < data.length; r++, row++) {
			const from = (data.offset + r) * DIMS;
			let s = 0;
			for (let d = 0; d < DIMS; d++) s += values[from + d] ** 2;
			const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
			for (let d = 0; d < DIMS; d++) vec[row * DIMS + d] = values[from + d] * inv;
		}
	}

	const index = new Map<number, number>();
	for (let i = 0; i < n; i++) index.set(ids[i], i);
	const meta = table.schema.metadata;
	return {
		ids,
		vec,
		complexity,
		usersRated,
		geekPct,
		line,
		index,
		profiles: JSON.parse(meta.get('similarity_profiles') ?? '[]') as Profile[],
		version: Number(meta.get('embedding_version') ?? NaN),
		model: meta.get('embedding_model') ?? ''
	};
}

let pending: Promise<VectorSet> | null = null;

/** Fetch and parse once per session; a failure clears the memo so the next call retries. */
export function fetchVectors(): Promise<VectorSet> {
	return (pending ??= (async () => parseVectors(await fetchArtifactBytes('/api/vectors')))().catch((e) => {
		pending = null;
		throw e;
	}));
}

/** Test seam / sign-out: drop the memo so the next call refetches. */
export function _resetVectors(): void {
	pending = null;
}
