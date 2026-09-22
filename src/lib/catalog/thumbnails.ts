/**
 * A lean, DuckDB-free reader for the thumbnails artifact — for pages that want a handful of
 * `game_id → thumbnail` lookups (the game detail page's "Similar games" list) without paying
 * for the full catalog + DuckDB-WASM engine just to answer that. `apache-arrow` parses the
 * same Arrow IPC bytes `/api/thumbnails` already serves; no `conn.insertArrowFromIPCStream`,
 * no `catalog`/`thumbnails` tables, no WASM engine — just a plain JS Map.
 */
import { tableFromIPC } from 'apache-arrow';
import { fetchArtifactBytes } from './artifact-fetch';

/** Fetch and parse `/api/thumbnails` into a `game_id → thumbnail` map. */
export async function fetchThumbnailMap(): Promise<Map<number, string>> {
	const table = tableFromIPC(await fetchArtifactBytes('/api/thumbnails'));

	const ids = table.getChild('game_id');
	const thumbs = table.getChild('thumbnail');
	const map = new Map<number, string>();
	for (let i = 0; i < table.numRows; i++) {
		const thumb = thumbs?.get(i);
		if (thumb) map.set(Number(ids?.get(i)), thumb as string);
	}
	return map;
}
