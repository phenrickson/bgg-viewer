/**
 * PROTOTYPE: the Recommend tool's warehouse-backed neighbour lists, for the cases the
 * collection artifact can't answer locally.
 *
 *   pool=all                      — the precomputed catalog lists (`game_neighbors`, via the
 *                                   game document). Fast.
 *   pool=collection&username=     — live: neighbours within that user's owned games (~3 s).
 *   pool=exclude&username=        — live: neighbours among games that user does NOT own.
 *
 * Returns `{ profiles: { similar, recommender, sicko } }` of `{ id, similarity }`, best first.
 * Username access matches `/api/collection`: your own, or any for an admin.
 */
import { error, json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { warehouseClient, GameNotFoundError, type SimilarWireRow } from '$lib/server/warehouse';
import type { RequestHandler } from './$types';

const toList = (rows: SimilarWireRow[] | undefined) =>
	(rows ?? []).map((r) => ({ id: r.game_id, similarity: 1 - r.distance }));

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'id is required.');
	const pool = url.searchParams.get('pool') ?? 'all';

	const client = warehouseClient();
	if (pool === 'all') {
		try {
			const doc = await client.getGame(id);
			const p = doc.similar_profiles ?? { similar: doc.similar };
			return json({ profiles: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, toList(v)])) });
		} catch (e) {
			if (e instanceof GameNotFoundError) throw error(404, `game ${id} not found`);
			throw e;
		}
	}

	if (pool !== 'collection' && pool !== 'exclude') throw error(400, `unknown pool: ${pool}`);
	const username = url.searchParams.get('username')?.trim();
	if (!username) throw error(400, 'username is required for this pool.');
	const isSelf = locals.user.bgg_username != null && username === locals.user.bgg_username;
	if (!isAdmin(locals.user) && !isSelf) throw error(403, 'Not authorized for this username.');

	const p = await client.getSimilarPooled(
		id,
		pool === 'collection' ? { collection: username } : { excludeCollection: username }
	);
	return json({ profiles: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, toList(v)])) });
};
