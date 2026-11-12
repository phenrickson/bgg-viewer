/** The BGG.CON library as games (admin-only). Copy ids stay on the server. */
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/bggcon/gate';
import { getLibrary } from '$lib/server/bggcon/library';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals.user);
	const lib = await getLibrary();
	return json({
		builtAt: lib.builtAt,
		games: lib.games.map(({ bgg_id, name, copies, play_to_win }) => ({ bgg_id, name, copies, play_to_win }))
	});
};
