/**
 * A lean, DuckDB-free reader for the thumbnails artifact — for pages that want a handful of
 * per-game lookups (the game detail page's "Similar games" list) without paying for the
 * full catalog + DuckDB-WASM engine just to answer that. `apache-arrow` parses the same
 * Arrow IPC bytes `/api/thumbnails` already serves; no `conn.insertArrowFromIPCStream`, no
 * `catalog`/`thumbnails` tables, no WASM engine — just a plain JS Map.
 *
 * The artifact carries `thumbnail` and `geek_rating` per game: box art plus the number the
 * neighbour row's rating badge shows.
 */
import { tableFromIPC } from 'apache-arrow';

export interface NeighborMeta {
	thumbnail: string | null;
	geek: number | null;
}

/** Fetch and parse `/api/thumbnails` into a `game_id → { thumbnail, geek }` map. */
export async function fetchNeighborMeta(): Promise<Map<number, NeighborMeta>> {
	const res = await fetch('/api/thumbnails');
	if (!res.ok) throw new Error(`thumbnails fetch failed (${res.status})`);
	const buf = new Uint8Array(await res.arrayBuffer());
	const table = tableFromIPC(buf);

	const ids = table.getChild('game_id');
	const thumbs = table.getChild('thumbnail');
	const geeks = table.getChild('geek_rating');
	const map = new Map<number, NeighborMeta>();
	for (let i = 0; i < table.numRows; i++) {
		const id = Number(ids?.get(i));
		const thumb = thumbs?.get(i);
		const geek = geeks?.get(i);
		map.set(id, {
			thumbnail: thumb ? (thumb as string) : null,
			geek: geek != null && Number.isFinite(Number(geek)) ? Number(geek) : null
		});
	}
	return map;
}
