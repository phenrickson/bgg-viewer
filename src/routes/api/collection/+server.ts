/**
 * Returns a BGG username's owned game ids for the client-side collection filter. Admin can
 * look up any username; everyone else can only look up their own linked `bgg_username` — the
 * same endpoint backs both the admin picker and the "My collection" toggle.
 * Phase 1/2 only read what's already synced into `collections.user_collections` — no
 * synchronous BGG fetch here (see docs/superpowers/specs/2026-08-26-collection-filter-design.md).
 */
import { error, json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { fetchOwnedCollection } from '$lib/server/collections/read';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const username = url.searchParams.get('username')?.trim();
	if (!username) throw error(400, 'username is required.');

	const isSelf = locals.user.bgg_username != null && username === locals.user.bgg_username;
	if (!isAdmin(locals.user) && !isSelf) throw error(403, 'Not authorized for this username.');

	return json(await fetchOwnedCollection(username));
};
