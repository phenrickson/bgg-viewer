/** The signed-in admin's starred BGG.CON games: read, and replace wholesale. */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/bggcon/gate';
import { parseStars, readStars, writeStars } from '$lib/server/bggcon/stars';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireAdmin(locals.user);
	return json(await readStars(user.user_id));
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const user = requireAdmin(locals.user);
	let ids: number[];
	try {
		ids = parseStars(await request.json());
	} catch (e) {
		throw error(400, e instanceof Error ? e.message : 'Bad request.');
	}
	await writeStars(user.user_id, ids);
	return json(ids);
};
