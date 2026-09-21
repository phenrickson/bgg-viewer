/**
 * Client reader for `/api/coordinates` — the same DuckDB-free `apache-arrow` path
 * `catalog/thumbnails.ts` takes, but into typed arrays rather than a Map: the map draws
 * 36k points per frame and wants column access, not 36k boxed row objects.
 */
import { tableFromIPC, type Table } from 'apache-arrow';

export interface CoordinateSet {
	/** Game ids, artifact order (ascending). */
	ids: Int32Array;
	/** `pcs[i]` is component i+1 (so `pcs[0]` is PC1), one Float32Array per component. */
	pcs: Float32Array[];
	umap: [Float32Array, Float32Array];
	/** Number of components carried — `pcs.length`. */
	k: number;
	model: string;
	version: number;
	/** `id → row index`, built once. */
	index: Map<number, number>;
}

function f32(table: Table, name: string): Float32Array {
	const col = table.getChild(name);
	if (!col) throw new Error(`coordinates artifact is missing column ${name}`);
	const arr = col.toArray();
	return arr instanceof Float32Array ? arr : Float32Array.from(arr as ArrayLike<number>);
}

/** Parse the Arrow IPC bytes `/api/coordinates` serves. Exported for tests. */
export function parseCoordinates(buf: Uint8Array): CoordinateSet {
	const table = tableFromIPC(buf);
	const k = Number(table.schema.metadata.get('k') ?? 0);
	if (!Number.isInteger(k) || k < 2) throw new Error(`coordinates artifact has bad k=${k}`);
	const idCol = table.getChild('game_id');
	if (!idCol) throw new Error('coordinates artifact is missing game_id');
	const raw = idCol.toArray();
	const ids = raw instanceof Int32Array ? raw : Int32Array.from(raw as ArrayLike<number>);
	const pcs = Array.from({ length: k }, (_, i) => f32(table, `pc_${i + 1}`));
	const index = new Map<number, number>();
	for (let i = 0; i < ids.length; i++) index.set(ids[i], i);
	return {
		ids,
		pcs,
		umap: [f32(table, 'umap_1'), f32(table, 'umap_2')],
		k,
		model: table.schema.metadata.get('embedding_model') ?? '',
		version: Number(table.schema.metadata.get('embedding_version') ?? NaN),
		index
	};
}

/**
 * The artifact is ~1 MB and behind auth, so it is fetched lazily — only by a page that
 * actually draws points, never as part of catalog warm-up. Memoised as a promise (the same
 * shape `initCatalog` uses) so that toggling between the list and the plot, or moving
 * between Explore and the map, costs one fetch per session rather than one per mount.
 *
 * A failed fetch clears the memo, so a network blip doesn't poison the rest of the session.
 */
let pending: Promise<CoordinateSet> | null = null;

export function fetchCoordinates(): Promise<CoordinateSet> {
	return (pending ??= (async () => {
		const res = await fetch('/api/coordinates');
		if (!res.ok) throw new Error(`coordinates fetch failed (${res.status})`);
		return parseCoordinates(new Uint8Array(await res.arrayBuffer()));
	})().catch((e) => {
		pending = null;
		throw e;
	}));
}

/** Test seam / sign-out: drop the memo so the next call refetches. */
export function _resetCoordinates(): void {
	pending = null;
}
