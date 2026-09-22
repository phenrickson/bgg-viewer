/**
 * Build the coordinates artifact and upload it to GCS.
 *
 * The map's positions: the first `K_COMPONENTS` PCA components plus the 2-D UMAP, one row
 * per working-set game. Previously built inside the Cloud Run process on a TTL, which meant
 * a cold container paginated ~36k rows out of BigQuery before the map could draw anything —
 * measured at 7.2s through the endpoint.
 *
 * Kept as its own artifact rather than folded into the catalog: `K_COMPONENTS` is expected
 * to rise, and every added component inside the catalog is weight every user carries for a
 * page most sessions never open.
 *
 * Reuses the app's own `columns.ts` and `serialize.ts` — the schema metadata (`k`, model,
 * version) that the client reader validates is written there, and a second copy of the query
 * here is exactly the drift those modules exist to prevent. The publish half is
 * `lib/publish-artifact.ts`.
 *
 * Note the zero-row case is not merely "no data": the query joins embeddings to coordinates
 * on version as well as game_id, so zero rows means a model bump landed in one prediction
 * table and not the other. Failing keeps the last good artifact in place rather than
 * publishing an empty map.
 *
 * Usage: tsx scripts/build-coordinates-artifact.ts [--dry-run]
 */
import { BigQuery } from '@google-cloud/bigquery';
import { coordinatesQuerySql } from '../src/lib/server/coordinates/columns';
import { rowsToArrowIPC, type CoordinateRow } from '../src/lib/server/coordinates/serialize';
import { publishArtifact } from './lib/publish-artifact';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const BUCKET = process.env.CATALOG_BUCKET || `${PROJECT}-bgg-viewer-artifacts`;

async function main(): Promise<void> {
	const t0 = Date.now();
	const bq = new BigQuery({ projectId: PROJECT });

	console.log('Querying BigQuery…');
	const [rows] = await bq.query({
		query: coordinatesQuerySql(
			`${PROJECT}.analytics.games_features`,
			`${PROJECT}.predictions.bgg_game_embeddings`,
			`${PROJECT}.predictions.bgg_game_coordinates`
		)
	});
	console.log(`  ${rows.length.toLocaleString()} rows in ${Date.now() - t0}ms`);

	await publishArtifact({
		prefix: 'coordinates',
		pointerName: 'coordinates-current.json',
		raw: rowsToArrowIPC(rows as CoordinateRow[]),
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
