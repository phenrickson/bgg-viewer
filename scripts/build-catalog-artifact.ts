/**
 * Build the in-browser catalog artifact and upload it to GCS.
 *
 * This runs in CI (`.github/workflows/catalog-artifact.yml`), triggered when the warehouse
 * pipeline finishes — NOT at request time, which is the whole point. The artifact was
 * previously built inside the Cloud Run process on a 6h TTL; because that cache is
 * in-process and the service scales to zero, every cold container rebuilt it on its first
 * request. Measured: 14.6s, in the user's critical path, on what is normally a cold visit.
 *
 * Of that 14.6s, 12.0s is pulling ~36k rows over BigQuery's paginated JSON REST API — not
 * the scan (BigQuery executes in 1.9s) and not serialization (725ms). Moving the work here
 * removes all of it from the user's path, which is why the slower REST fetch is acceptable:
 * nobody is waiting on this.
 *
 * WHY TYPESCRIPT (run via tsx), unlike `build-landing-content.js` next door: this must reuse
 * `columns.ts` and `serialize.ts`. That shared definition is the point — `columns.ts` drives
 * both the BigQuery SELECT and the Arrow schema "so the two can't drift", and a second
 * hand-written copy of the query here would be exactly that drift.
 *
 * OUTPUT — two objects, written in this order:
 *   catalog-<hash>.arrow.gz   the artifact, named by content hash
 *   catalog-current.json      the pointer naming that hash
 *
 * The pointer is written LAST and never in the same operation, so it can only ever name an
 * object that is already fully uploaded. A reader that sees a hash can trust it exists.
 *
 * Usage: tsx scripts/build-catalog-artifact.ts
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { catalogQuerySql } from '../src/lib/server/catalog/columns';
import { rowsToArrowIPC, type CatalogRow } from '../src/lib/server/catalog/serialize';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const BUCKET = process.env.CATALOG_BUCKET || `${PROJECT}-bgg-viewer-artifacts`;

/** Matches `artifact-cache.ts`'s `versionOf` exactly — hash of the UNCOMPRESSED bytes. */
const versionOf = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex').slice(0, 16);

const POINTER = 'catalog-current.json';

async function main(): Promise<void> {
	const t0 = Date.now();
	const bq = new BigQuery({ projectId: PROJECT });
	const sql = catalogQuerySql(
		`${PROJECT}.analytics.games_features`,
		`${PROJECT}.analytics.best_player_counts`,
		`${PROJECT}.predictions.bgg_predictions`
	);

	console.log('Querying BigQuery…');
	const [rows] = await bq.query({ query: sql });
	if (!rows.length) throw new Error('catalog query returned zero rows — refusing to publish');
	console.log(`  ${rows.length.toLocaleString()} rows in ${Date.now() - t0}ms`);

	const raw = rowsToArrowIPC(rows as CatalogRow[]);
	const hash = versionOf(raw);
	const body = gzipSync(raw);
	const name = `catalog-${hash}.arrow.gz`;
	console.log(`  arrow ${(raw.byteLength / 1e6).toFixed(2)} MB → gzip ${(body.byteLength / 1e6).toFixed(2)} MB (${hash})`);

	const bucket = new Storage({ projectId: PROJECT }).bucket(BUCKET);

	/**
	 * Skip the upload when the hash already exists: the pipeline can run without the catalog
	 * actually changing, and re-uploading would rewrite the object's metadata — resetting the
	 * age its lifecycle rule is measured from, and needlessly busting a `Cache-Control` window
	 * browsers are already inside.
	 */
	const file = bucket.file(name);
	const [exists] = await file.exists();
	if (exists) {
		console.log('  artifact already present — skipping upload');
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
		console.log(`  uploaded gs://${BUCKET}/${name}`);
	}

	// LAST. See the header: the pointer must never name an object that isn't there yet.
	await bucket.file(POINTER).save(
		JSON.stringify({ hash, name, builtAt: new Date().toISOString(), rows: rows.length, bytes: body.byteLength }, null, 2),
		{
			resumable: false,
			// The pointer must never be cached — it is the one thing that has to change the
			// instant a new artifact lands, and it is tiny.
			metadata: { contentType: 'application/json', cacheControl: 'no-store' }
		}
	);
	console.log(`  pointer updated → ${name}`);
	console.log(`Done in ${Date.now() - t0}ms`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
