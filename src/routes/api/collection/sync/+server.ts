/**
 * Admin only: fetch a BGG username's collection into the warehouse now — for "view as" on a
 * username the warehouse has never seen. Calls the same `triggerSync` registration and Settings
 * use; the page then polls `/api/collection` until the owned games land
 * (spec 2026-11-09 §4).
 */
import { error, json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { triggerSync } from '$lib/server/collections/sync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');
	if (!isAdmin(locals.user)) throw error(403, 'Admin only.');
	const username = url.searchParams.get('username')?.trim();
	if (!username) throw error(400, 'username is required.');
	return json({ synced: await triggerSync(username, { force: true }) });
};
