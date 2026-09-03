/**
 * Serves the dev-only similarity-explorer dataset (Arrow IPC, gzipped) to the browser,
 * which parses it with apache-arrow and computes neighbour lists locally.
 *
 * Gated on `dev` — this scans ~97 MB of BigQuery and ships ~8 MB of embeddings, neither of
 * which has any business in production. The content-hash ETag lets a reload skip the
 * re-download while tuning.
 */
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { getSimilarExplorerArtifact } from '$lib/server/similar-explorer/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	if (!dev) throw error(404);

	const { body, version } = await getSimilarExplorerArtifact();
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
			'cache-control': 'private, must-revalidate'
		}
	});
};
