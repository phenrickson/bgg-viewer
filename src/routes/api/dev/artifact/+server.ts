/**
 * Dev only (`just dev-lan`): stream one artifact out of the bucket, same-origin, for a browser
 * on another machine whose origin isn't on the bucket's CORS list. All the rules (flag,
 * sign-in, which names) live in `serveDevArtifact`; this only wires the bucket in.
 */
import { Storage } from '@google-cloud/storage';
import { env } from '$env/dynamic/private';
import { artifactsViaServer, serveDevArtifact } from '$lib/server/dev-artifacts';
import type { RequestHandler } from './$types';

const project = () => env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const bucketName = () => env.CATALOG_BUCKET || `${project()}-bgg-viewer-artifacts`;

export const GET: RequestHandler = ({ locals, url }) =>
	serveDevArtifact({
		enabled: artifactsViaServer(),
		user: locals.user,
		name: url.searchParams.get('name') ?? '',
		// Stored bytes, still gzipped: the response re-declares content-encoding: gzip.
		download: async (name) => {
			const [buf] = await new Storage({ projectId: project() })
				.bucket(bucketName())
				.file(name)
				.download({ decompress: false });
			return new Uint8Array(buf);
		}
	});
