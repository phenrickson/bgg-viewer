/**
 * Point the authenticated browser at the catalog artifact.
 *
 * This used to stream the artifact itself (~5.25 MB of Arrow) out of the Cloud Run process,
 * having built it from BigQuery on a 6h in-process TTL. Because that cache could not outlive
 * its container and the service scales to zero, every cold container rebuilt it on the first
 * request — a measured 14.6s, in the user's critical path, on what is normally a cold visit.
 *
 * The artifact is now built in CI and stored in GCS, so the response is a signed URL and the
 * bytes travel from GCS straight to the browser. Cloud Run stops shipping them entirely,
 * which also means a burst of loads no longer occupies instances streaming.
 *
 * The gate is unchanged: gated data → explicit auth check, because server endpoints do not
 * inherit the `(app)` layout guard. The bucket is private and only this check stands between
 * an anonymous request and a signed URL.
 */
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getCatalogArtifact } from '$lib/server/catalog/cache';
import { getSignedCatalog } from '$lib/server/catalog/gcs';
import type { RequestHandler } from './$types';

/** Escape hatch: `CATALOG_SOURCE=bigquery` restores the old path without a redeploy. */
const forceBigQuery = () => (env.CATALOG_SOURCE ?? '').trim().toLowerCase() === 'bigquery';

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Sign in required.');

	if (!forceBigQuery()) {
		try {
			const { url, hash, builtAt } = await getSignedCatalog();
			return json({ url, hash, builtAt });
		} catch (e) {
			// Deliberately not fatal. GCS being unreachable, the pointer being absent (a fresh
			// bucket, before the first pipeline run) or a signing permission gap all fall back
			// to the path that was working yesterday, rather than taking the app down.
			console.error('[catalog] GCS path failed, falling back to BigQuery build:', e);
		}
	}

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
