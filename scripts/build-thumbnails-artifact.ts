/**
 * Build the thumbnails artifact and upload it to GCS.
 *
 * The same move the catalog made, for the same reason: the artifact was built inside the
 * Cloud Run process on a 24h in-process TTL, and because that cache cannot outlive its
 * container and the service scales to zero, every cold container rebuilt it — ~36k rows
 * paginated out of BigQuery over its JSON REST API, then Arrow-encoded and gzipped, while
 * that same container was also serving pages.
 *
 * Box art is deliberately non-blocking (see `catalog.svelte.ts`'s `loadThumbnails`), so the
 * user-visible symptom was mild — art arriving seconds late. The cost was to the serving
 * process, and on a scale-to-zero service the cold container is by definition the one under
 * load.
 *
 * Like `build-catalog-artifact.ts`, this reuses the app's own `columns.ts` and
 * `serialize.ts` rather than restating the query here: that shared definition is what keeps
 * the BigQuery SELECT and the Arrow schema from drifting, and it is why these scripts are
 * TypeScript run via tsx. The publish half — content-hashed name, no re-upload of an
 * unchanged hash, pointer written last, zero-row guard — is `lib/publish-artifact.ts`.
 *
 * Usage: tsx scripts/build-thumbnails-artifact.ts [--dry-run]
 *   --dry-run  query, serialize and print the hash; write nothing.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { thumbnailsQuerySql } from '../src/lib/server/thumbnails/columns';
import { rowsToArrowIPC, type ThumbnailRow } from '../src/lib/server/thumbnails/serialize';
import { publishArtifact } from './lib/publish-artifact';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const BUCKET = process.env.CATALOG_BUCKET || `${PROJECT}-bgg-viewer-artifacts`;

async function main(): Promise<void> {
	const t0 = Date.now();
	const bq = new BigQuery({ projectId: PROJECT });

	console.log('Querying BigQuery…');
	const [rows] = await bq.query({
		query: thumbnailsQuerySql(`${PROJECT}.analytics.games_features`)
	});
	console.log(`  ${rows.length.toLocaleString()} rows in ${Date.now() - t0}ms`);

	await publishArtifact({
		prefix: 'thumbnails',
		pointerName: 'thumbnails-current.json',
		raw: rowsToArrowIPC(rows as ThumbnailRow[]),
		rows: rows.length,
		bucketName: BUCKET,
		dryRun: process.argv.includes('--dry-run')
	});

	console.log(`Done in ${Date.now() - t0}ms`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
