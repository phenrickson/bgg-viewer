/** The signed-in user's phone-alert topic (spec §8), made on first request and kept. */
import { json } from '@sveltejs/kit';
import { getTopic } from '$lib/server/bggcon/alerts';
import { requireUser } from '$lib/server/bggcon/gate';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals.user);
	return json({ topic: await getTopic(user) });
};
