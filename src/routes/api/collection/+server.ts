/**
 * Admin-only: returns a BGG username's owned game ids for the client-side collection filter.
 * Phase 1 only reads what's already synced into `collections.user_collections` — no on-demand
 * BGG fetch (see docs/superpowers/specs/2026-08-26-collection-filter-design.md).
 */
import { error, json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { fetchOwnedCollection } from '$lib/server/collections/read';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');
	if (!isAdmin(locals.user)) throw error(403, 'Admin only.');

	const username = url.searchParams.get('username')?.trim();
	if (!username) throw error(400, 'username is required.');

	return json(await fetchOwnedCollection(username));
};
