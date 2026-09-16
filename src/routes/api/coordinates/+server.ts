/**
 * Serves the coordinates artifact (Arrow IPC: `game_id`, `pc_1..pc_K`, `umap_1/2`; model
 * identity in the schema metadata) to the authenticated browser. Fetched only by the map
 * page, on open — never as part of catalog warm-up, so its ~1 MB is paid only by sessions
 * that look at the map. Same caching posture as `/api/thumbnails`: a day of staleness is
 * invisible, and `private` because it sits behind the same auth gate.
 */
import { error } from '@sveltejs/kit';
import { getCoordinatesArtifact } from '$lib/server/coordinates/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const { body, version } = await getCoordinatesArtifact();
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
