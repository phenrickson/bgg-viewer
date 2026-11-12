/**
 * Availability (admin-only): how many copies of each game are checked out right now, by BGG
 * id. Doesn't read the library; the page combines this with `/api/bggcon/library`'s copy
 * counts. `?ids=` limits it to those BGG ids. A game with nothing out is simply absent.
 */
import { json } from '@sveltejs/kit';
import { requireAdmin, parseIds } from '$lib/server/bggcon/gate';
import { getCheckedOut } from '$lib/server/bggcon/checked-out';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAdmin(locals.user);
	const ids = parseIds(url.searchParams.get('ids'));
	const out = await getCheckedOut();
	const checked_out = ids
		? Object.fromEntries(ids.filter((id) => out.value[id]).map((id) => [id, out.value[id]]))
		: out.value;
	return json({ as_of: new Date(out.at).toISOString(), stale: out.stale, checked_out });
};
