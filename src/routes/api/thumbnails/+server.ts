/**
 * Point the authenticated browser at the thumbnails artifact (Arrow IPC: `game_id`,
 * `thumbnail`).
 *
 * Same two-shape design as `/api/catalog`: a signed GCS URL when the CI-built artifact is
 * available, the bytes themselves otherwise. The artifact used to be built inside this
 * process on a 24h in-process TTL, which meant every cold container paginated ~36k rows out
 * of BigQuery — measured at 3.4s for the query alone — and then shipped 1.84 MB through
 * Cloud Run. Fetching the published object instead takes about a tenth of a second.
 *
 * The fallback is deliberate and not an afterthought. A fresh bucket before the first
 * pipeline run, GCS unreachable, a signing permission gap or offline mode all drop back to
 * the path that was working yesterday, rather than taking box art away.
 *
 * Cache-Control on the byte path is longer-lived than `/api/catalog`'s `must-revalidate`:
 * box art barely ever changes for a given game, unlike ratings. Still `private`, matching
 * the catalog's scope, since both sit behind the same auth gate.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getThumbnailsArtifact } from '$lib/server/thumbnails/cache';
import { getSignedThumbnails } from '$lib/server/thumbnails/gcs';
import { isOffline } from '$lib/server/offline';
import type { RequestHandler } from './$types';

/** Escape hatch: `THUMBNAILS_SOURCE=bigquery` restores the old path without a redeploy. */
const forceBigQuery = () => (env.THUMBNAILS_SOURCE ?? '').trim().toLowerCase() === 'bigquery';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	// `isOffline()` first: offline mode is a deliberate "the network is about to go away"
	// switch, so reaching for GCS and waiting for it to fail would be exactly wrong.
	if (!isOffline() && !forceBigQuery()) {
		try {
			const { url, hash, builtAt } = await getSignedThumbnails();
			return json({ url, hash, builtAt });
		} catch (e) {
			console.error('[thumbnails] GCS path failed, falling back to BigQuery build:', e);
		}
	}

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
