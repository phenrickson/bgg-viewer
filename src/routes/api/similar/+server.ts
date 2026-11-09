/**
 * Recommend's *anywhere* answer: a game's precomputed neighbour lists (`game_neighbors`, via
 * its warehouse document). The shelf pools rank in the browser instead (`$lib/recommend/rank`).
 *
 * Returns `{ profiles: { similar, recommender, sicko } }` of `{ id, similarity }`, best first.
 * `pool` is accepted only as `all` (the default), so a stale client asking for a live pool gets
 * a clear 400 rather than a silent catalog answer.
 */
import { error, json } from '@sveltejs/kit';
import { warehouseClient, GameNotFoundError, type SimilarWireRow } from '$lib/server/warehouse';
import type { RequestHandler } from './$types';

const toList = (rows: SimilarWireRow[] | undefined) =>
	(rows ?? []).map((r) => ({ id: r.game_id, similarity: 1 - r.distance }));
const toProfiles = (p: Record<string, SimilarWireRow[]>) =>
	Object.fromEntries(Object.entries(p).map(([k, v]) => [k, toList(v)]));

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'id is required.');
	const pool = url.searchParams.get('pool') ?? 'all';
	if (pool !== 'all') throw error(400, `unknown pool: ${pool}`);

	try {
		const doc = await warehouseClient().getGame(id);
		const p = doc.similar_profiles ?? { similar: doc.similar };
		return json({ profiles: toProfiles(p) });
	} catch (e) {
		if (e instanceof GameNotFoundError) throw error(404, `game ${id} not found`);
		throw e;
	}
};
