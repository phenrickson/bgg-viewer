/**
 * Per game: copies on the shelf out of copies in the library (admin-only). `?ids=` limits it to
 * those BGG ids, which is what the starred-games page asks for.
 */
import { json } from '@sveltejs/kit';
import { requireAdmin, parseIds } from '$lib/server/bggcon/gate';
import { getLibrary } from '$lib/server/bggcon/library';
import { getCheckedOut } from '$lib/server/bggcon/checked-out';
import { availability } from '$lib/server/bggcon/group';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAdmin(locals.user);
	const ids = parseIds(url.searchParams.get('ids'));
	const [lib, out] = await Promise.all([getLibrary(), getCheckedOut()]);
	const wanted = ids ? new Set(ids) : null;
	const games = wanted ? lib.games.filter((g) => wanted.has(g.bgg_id)) : lib.games;
	return json({
		as_of: new Date(out.at).toISOString(),
		stale: out.stale,
		games: availability(games, out.value)
	});
};
