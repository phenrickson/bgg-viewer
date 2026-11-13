/**
 * Availability: how many copies of each game are checked out right now, and each game's checkouts
 * since the con opened, by BGG id; from Tabletop.Events or the recorder (`availability.ts`).
 * Doesn't read the library; the page combines this with `/api/bggcon/library`'s copy counts.
 * `?ids=` limits it to those BGG ids. A game with nothing out is simply absent.
 */
import { json } from '@sveltejs/kit';
import { requireUser, parseIds } from '$lib/server/bggcon/gate';
import { getAvailability } from '$lib/server/bggcon/checked-out';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireUser(locals.user);
	const ids = parseIds(url.searchParams.get('ids'));
	const a = await getAvailability();
	const only = (m: Record<number, number>) =>
		ids ? Object.fromEntries(ids.filter((id) => m[id]).map((id) => [id, m[id]])) : m;
	return json({
		...a,
		checked_out: only(a.checked_out),
		checkouts: a.checkouts && only(a.checkouts)
	});
};
