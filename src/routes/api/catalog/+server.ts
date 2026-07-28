/**
 * Serves the catalog artifact (Arrow IPC) to the authenticated browser, which loads it
 * into DuckDB-WASM. Gated data → explicit auth check (server endpoints don't inherit the
 * `(app)` layout guard). The content-hash ETag lets the browser skip re-downloading when
 * the catalog hasn't changed.
 */
import { error } from '@sveltejs/kit';
import { getCatalogArtifact } from '$lib/server/catalog/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	const { body, version } = await getCatalogArtifact();
	const etag = `"${version}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	// Hand Response an exact ArrayBuffer slice (BodyInit doesn't type Uint8Array views;
	// gzip output is always backed by a regular ArrayBuffer, never a SharedArrayBuffer).
	const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
	return new Response(buf, {
		headers: {
			'content-type': 'application/vnd.apache.arrow.stream',
			'content-encoding': 'gzip',
			etag,
			'cache-control': 'private, must-revalidate'
		}
	});
};
