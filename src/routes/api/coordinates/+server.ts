/**
 * Serves the coordinates artifact (Arrow IPC: `game_id`, `pc_1..pc_K`, `umap_1/2`; model
 * identity in the schema metadata) to the authenticated browser. Fetched only by the map
 * page, on open — never as part of catalog warm-up, so its ~1 MB is paid only by sessions
 * that look at the map. Same caching posture as `/api/thumbnails`: a day of staleness is
 * invisible, and `private` because it sits behind the same auth gate.
 *
 * Same two-shape design as `/api/catalog` and `/api/thumbnails`: a signed GCS URL when the
 * CI-built artifact is available, the bytes themselves otherwise. Building it here took a
 * measured 7.2s on a cold container, paginating ~36k rows out of BigQuery before the map
 * could draw anything; fetching the published object is about a tenth of a second.
 *
 * The fallback is deliberate — a fresh bucket before the first run, GCS unreachable, a
 * signing gap or offline mode all drop back to the path that worked yesterday.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getCoordinatesArtifact } from '$lib/server/coordinates/cache';
import { getSignedCoordinates } from '$lib/server/coordinates/gcs';
import { isOffline } from '$lib/server/offline';
import type { RequestHandler } from './$types';

/** Escape hatch: `COORDINATES_SOURCE=bigquery` restores the old path without a redeploy. */
const forceBigQuery = () => (env.COORDINATES_SOURCE ?? '').trim().toLowerCase() === 'bigquery';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	// `isOffline()` first: offline mode is a deliberate "the network is about to go away"
	// switch, so reaching for GCS and waiting for it to fail would be exactly wrong.
	if (!isOffline() && !forceBigQuery()) {
		try {
			const { url, hash, builtAt } = await getSignedCoordinates();
			return json({ url, hash, builtAt });
		} catch (e) {
			console.error('[coordinates] GCS path failed, falling back to BigQuery build:', e);
		}
	}

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
