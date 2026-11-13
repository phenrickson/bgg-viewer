/**
 * "Like this, in the library": Recommend's own `rankShelf` with the library as the shelf, then
 * the library rows for those games. Kept per game, so the dashboard can look them up before it
 * opens a row and the panel draws once, already filled in, instead of growing as they arrive.
 */
import { query } from '$lib/catalog/catalog.svelte';
import { fetchVectors, loadedVectors } from '$lib/recommend/vectors';
import { rankShelf } from '$lib/recommend/rank';
import { listSql, type LibraryListRow } from './queries';

export type Like = LibraryListRow & { similarity: number };

const LIKE_N = 5;
const cache = new Map<number, Like[]>();

/** The last lookup for this game, if there's been one. */
export const cachedLikes = (id: number): Like[] | undefined => cache.get(id);

export async function loadLikes(id: number, libraryIds: ReadonlySet<number>): Promise<Like[]> {
	const v = loadedVectors() ?? (await fetchVectors());
	const hits = rankShelf(v, id, libraryIds, LIKE_N).similar;
	if (!hits.length) {
		cache.set(id, []);
		return [];
	}
	const sim = new Map(hits.map((h) => [h.id, h.similarity]));
	const rows = await query<LibraryListRow>(
		listSql({ mode: 'focus', ids: hits.map((h) => h.id), availableOnly: false, offset: 0, limit: LIKE_N })
	);
	const likes = rows
		.map((r) => ({ ...r, similarity: sim.get(r.game_id) ?? 0 }))
		.sort((a, b) => b.similarity - a.similarity);
	cache.set(id, likes);
	return likes;
}
