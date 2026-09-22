/**
 * Build the in-browser catalog artifact and upload it to GCS.
 *
 * This runs in CI (`.github/workflows/viewer-artifacts.yml`), triggered when the warehouse
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
 * That rule, the skip-if-already-present rule and the zero-row guard now live in
 * `lib/publish-artifact.ts`, shared with the other artifacts and covered by its tests —
 * this script owns only the half that cannot be shared, the query and the serializer.
 *
 * Usage: tsx scripts/build-catalog-artifact.ts [--dry-run]
 *   --dry-run  query, serialize and print the hash; write nothing.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { catalogQuerySql } from '../src/lib/server/catalog/columns';
import { rowsToArrowIPC, type CatalogRow } from '../src/lib/server/catalog/serialize';
import { publishArtifact } from './lib/publish-artifact';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const BUCKET = process.env.CATALOG_BUCKET || `${PROJECT}-bgg-viewer-artifacts`;

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
	console.log(`  ${rows.length.toLocaleString()} rows in ${Date.now() - t0}ms`);

	await publishArtifact({
		prefix: 'catalog',
		pointerName: 'catalog-current.json',
		raw: rowsToArrowIPC(rows as CatalogRow[]),
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
