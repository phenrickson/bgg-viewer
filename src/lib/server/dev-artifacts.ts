/**
 * Dev only: serve the four browser-loaded artifacts (catalog, thumbnails, vectors,
 * coordinates) through the dev server, instead of handing the browser a signed GCS URL.
 *
 * Why it exists: the artifacts bucket's CORS list allows `http://localhost:5173`, not
 * `http://<pc-ip>:5173`. So the dev server bound to the LAN (`just dev-lan`) is reachable
 * from another machine, but that machine's browser is refused the signed-URL fetch, and
 * nothing reports it: GCS still answers 200. Serving the bytes same-origin avoids CORS
 * entirely, with no change to the production bucket or to the client, which already
 * follows whatever `url` the endpoint gives it.
 *
 * Dev-only by construction, like `offline.ts`: `dev` is compile-time, so a production build
 * can't turn this on, however ARTIFACTS_VIA_SERVER is set.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export function artifactsViaServer(): boolean {
	return dev && TRUTHY.has((env.ARTIFACTS_VIA_SERVER ?? '').trim().toLowerCase());
}

/**
 * The published object names, `<prefix>-<hash>.arrow.gz` (scripts/lib/publish-artifact.ts).
 * Anything else, such as pointers, `bggcon/` or a path, is refused, so the route can't be
 * used to read the rest of the bucket.
 */
const ARTIFACT_NAME = /^(catalog|thumbnails|vectors|coordinates)-[0-9a-f]+\.arrow\.gz$/;

export const isArtifactObjectName = (name: string): boolean => ARTIFACT_NAME.test(name);

export const devArtifactUrl = (name: string): string =>
	`/api/dev/artifact?name=${encodeURIComponent(name)}`;

export interface ServeDevArtifactArgs {
	enabled: boolean;
	user: unknown;
	name: string;
	/** The object's stored bytes, still gzipped (download with `decompress: false`). */
	download: (name: string) => Promise<Uint8Array>;
}

export async function serveDevArtifact({
	enabled,
	user,
	name,
	download
}: ServeDevArtifactArgs): Promise<Response> {
	if (!enabled) return new Response('Not found', { status: 404 });
	if (!user) return new Response('Sign in required.', { status: 401 });
	if (!isArtifactObjectName(name)) return new Response('Not an artifact.', { status: 400 });

	const body = await download(name);
	const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
	// Same headers the object is stored with, so the browser decompresses it exactly as it
	// would from GCS.
	return new Response(buf, {
		headers: {
			'content-type': 'application/vnd.apache.arrow.stream',
			'content-encoding': 'gzip',
			'cache-control': 'private, max-age=86400'
		}
	});
}
