/**
 * Publish a built artifact to GCS: hash, gzip, upload under a content-hashed name, then
 * point at it.
 *
 * Everything here is artifact-agnostic. The caller owns the half that cannot be shared —
 * the BigQuery query and the Arrow serializer — because those must keep coming from each
 * artifact's own `columns.ts`/`serialize.ts` so the SELECT and the Arrow schema can't drift.
 * Everything from "I have Arrow bytes" onward is identical between artifacts, and three of
 * the steps are quietly dangerous to re-derive, which is why they live in one function
 * rather than in each build script:
 *
 *  - the pointer is written LAST, in its own operation, so it can only ever name an object
 *    that is already fully uploaded (a pointer naming a missing object is an instant 404
 *    for every reader at once);
 *  - an artifact whose hash is already present is NOT re-uploaded, because rewriting the
 *    object resets the age its lifecycle rule is measured from and busts a `Cache-Control`
 *    window browsers are already inside — and the pipeline fires daily whether or not the
 *    data changed, so this is the common path;
 *  - zero rows never publish over a good artifact.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Storage } from '@google-cloud/storage';

/**
 * Hash of the UNCOMPRESSED bytes, first 16 hex — identical to `artifact-cache.ts`'s
 * `versionOf`. Nothing compares the two at runtime (the ETag belongs to the byte-serving
 * fallback, this hash to the GCS path), so a drift would not break a user; it would break
 * the ability to ask whether the published artifact matches what a local build produces.
 * Keep them equal and assert it.
 */
export const versionOf = (raw: Uint8Array) =>
	createHash('sha256').update(raw).digest('hex').slice(0, 16);

/**
 * The slice of `@google-cloud/storage` this module uses. A seam, so the ordering and
 * skip-if-present rules above can be tested against a fake instead of trusted to a comment.
 */
export interface ArtifactBucket {
	file(name: string): {
		exists(): Promise<[boolean]>;
		save(data: string | Buffer, opts: unknown): Promise<unknown>;
	};
}

export interface PublishOptions {
	/** Object name prefix, e.g. `catalog` → `catalog-<hash>.arrow.gz`. */
	prefix: string;
	/** Pointer object name, e.g. `catalog-current.json`. */
	pointerName: string;
	/** Serialized Arrow IPC bytes, uncompressed. */
	raw: Uint8Array;
	/** Row count — published in the pointer, and the zero-row guard. */
	rows: number;
	bucketName: string;
	/** Injected in tests; defaults to the real bucket. */
	bucket?: ArtifactBucket;
	/** Hash and report, touching nothing. The verification path for a refactor. */
	dryRun?: boolean;
	log?: (msg: string) => void;
}

export interface PublishResult {
	hash: string;
	name: string;
	bytes: number;
	/** False when the object was already present, or when this was a dry run. */
	uploaded: boolean;
}

export function artifactBucket(project: string, bucketName: string): ArtifactBucket {
	return new Storage({ projectId: project }).bucket(bucketName) as unknown as ArtifactBucket;
}

export async function publishArtifact({
	prefix,
	pointerName,
	raw,
	rows,
	bucketName,
	bucket,
	dryRun = false,
	log = console.log
}: PublishOptions): Promise<PublishResult> {
	if (rows <= 0) throw new Error(`${prefix} query returned zero rows — refusing to publish`);

	const hash = versionOf(raw);
	const body = gzipSync(raw);
	const name = `${prefix}-${hash}.arrow.gz`;
	log(
		`  arrow ${(raw.byteLength / 1e6).toFixed(2)} MB → gzip ${(body.byteLength / 1e6).toFixed(2)} MB (${hash})`
	);

	if (dryRun) {
		log(`  dry run — would publish gs://${bucketName}/${name}; nothing written`);
		return { hash, name, bytes: body.byteLength, uploaded: false };
	}

	const b = bucket ?? artifactBucket(process.env.GCP_PROJECT_ID || 'bgg-data-warehouse', bucketName);

	const file = b.file(name);
	const [exists] = await file.exists();
	if (exists) {
		log('  artifact already present — skipping upload');
	} else {
		await file.save(Buffer.from(body), {
			resumable: false,
			metadata: {
				contentType: 'application/vnd.apache.arrow.stream',
				// Stored gzipped and served gzipped; browsers decompress transparently, so the
				// client reads plain Arrow bytes exactly as it did from the old endpoint.
				contentEncoding: 'gzip',
				// Immutable in practice: the name changes whenever the content does, so a long
				// max-age costs nothing and turns repeat visits into cache hits.
				cacheControl: 'private, max-age=86400'
			}
		});
		log(`  uploaded gs://${bucketName}/${name}`);
	}

	// LAST. See the header: the pointer must never name an object that isn't there yet.
	await b.file(pointerName).save(
		JSON.stringify({ hash, name, builtAt: new Date().toISOString(), rows, bytes: body.byteLength }, null, 2),
		{
			resumable: false,
			// The pointer must never be cached — it is the one thing that has to change the
			// instant a new artifact lands, and it is tiny.
			metadata: { contentType: 'application/json', cacheControl: 'no-store' }
		}
	);
	log(`  pointer updated → ${name}`);

	return { hash, name, bytes: body.byteLength, uploaded: !exists };
}
