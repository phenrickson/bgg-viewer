/**
 * Serves the thumbnails artifact (Arrow IPC: `game_id`, `thumbnail`) to the authenticated
 * browser. Fetched by the client *after* the primary catalog has already loaded — see
 * `catalog.svelte.ts` — so this endpoint existing or being slow never delays first filter.
 *
 * Cache-Control is deliberately longer-lived than `/api/catalog`'s `must-revalidate`: box
 * art barely ever changes for a given game, unlike ratings, so a day of staleness here costs
 * nothing a user would notice. Still `private` (not `public`) — matches the catalog
 * endpoint's own scope, since both sit behind the same auth gate.
 */
import { error } from '@sveltejs/kit';
import { getThumbnailsArtifact } from '$lib/server/thumbnails/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const { body, version } = await getThumbnailsArtifact();
	const etag = `"${version}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
	return new Response(buf, {
		headers: {
			'content-type': 'application/vnd.apache.arrow.stream',
			'content-encoding': 'gzip',
			etag,
			'cache-control': 'private, max-age=86400'
		}
	});
};
