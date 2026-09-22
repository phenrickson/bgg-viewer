/**
 * Serves the tour's neighbours artifact (JSON, see `neighbours/build.ts`) to the
 * authenticated browser. Fetched only by the tour page; same caching posture as
 * `/api/coordinates`.
 */
import { error } from '@sveltejs/kit';
import { getNeighboursArtifact } from '$lib/server/neighbours/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const { body, version } = await getNeighboursArtifact();
	const etag = `"${version}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
	return new Response(buf, {
		headers: {
			'content-type': 'application/json',
			'content-encoding': 'gzip',
			etag,
			'cache-control': 'private, max-age=86400'
		}
	});
};
