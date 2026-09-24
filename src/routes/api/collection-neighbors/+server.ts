/**
 * PROTOTYPE: serves a collection's neighbours artifact (Arrow IPC, see
 * `server/collection-neighbors/`) for the Recommend tool. Same access rule as
 * `/api/collection`: your own linked `bgg_username`, or any username for an admin.
 *
 * Reads the local build (`scripts/build-collection-neighbors.ts`). Production swaps this for
 * the GCS rail — a pointer per username and a signed URL — which `fetchArtifactBytes`
 * on the client already understands.
 */
import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { cachePath } from '$lib/server/collection-neighbors/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const username = url.searchParams.get('username')?.trim();
	if (!username) throw error(400, 'username is required.');

	const isSelf = locals.user.bgg_username != null && username === locals.user.bgg_username;
	if (!isAdmin(locals.user) && !isSelf) throw error(403, 'Not authorized for this username.');

	let body: Buffer;
	try {
		body = await readFile(cachePath(username));
	} catch {
		throw error(404, `No neighbours built for ${username}.`);
	}
	return new Response(new Uint8Array(body), {
		headers: { 'content-type': 'application/vnd.apache.arrow.stream', 'cache-control': 'private, no-store' }
	});
};
