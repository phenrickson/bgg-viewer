/**
 * Serves the vectors artifact (Arrow IPC: every working-set game's 64-d embedding and ranking
 * columns, the similarity profiles in its metadata) to the authenticated browser, for
 * Recommend's shelf pools. A signed GCS URL when the pointer is there, the bytes otherwise —
 * the same two shapes `/api/coordinates` answers in, read by `fetchArtifactBytes`.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getVectorsArtifact } from '$lib/server/vectors/cache';
import { getSignedVectors } from '$lib/server/vectors/gcs';
import { isOffline } from '$lib/server/offline';
import type { RequestHandler } from './$types';

/** Escape hatch: `VECTORS_SOURCE=bigquery` restores the old path without a redeploy. */
const forceBigQuery = () => (env.VECTORS_SOURCE ?? '').trim().toLowerCase() === 'bigquery';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	// `isOffline()` first: offline mode is a deliberate "the network is about to go away"
	// switch, so reaching for GCS and waiting for it to fail would be exactly wrong.
	if (!isOffline() && !forceBigQuery()) {
		try {
			const { url, hash, builtAt } = await getSignedVectors();
			return json({ url, hash, builtAt });
		} catch (e) {
			console.error('[vectors] GCS path failed, falling back to BigQuery build:', e);
		}
	}

	const { body, version } = await getVectorsArtifact();
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
