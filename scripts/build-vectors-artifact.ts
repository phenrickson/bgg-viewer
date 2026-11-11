/**
 * Build the vectors artifact and upload it to GCS.
 *
 * Every working-set game's 64-d embedding and ranking columns, with the similarity profiles in
 * the schema metadata — what Recommend ranks with in the browser for its shelf pools. Spec:
 * docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md §1.
 *
 * Reuses the app's own `columns.ts` and `serialize.ts`, so the SELECT and the Arrow schema come
 * from one definition; the publish half is `lib/publish-artifact.ts`. Zero rows or zero
 * profiles fail the run and leave the last good artifact in place.
 *
 * Usage: tsx scripts/build-vectors-artifact.ts [--dry-run]
 */
import { BigQuery } from '@google-cloud/bigquery';
import { vectorsQuerySql, profilesQuerySql } from '../src/lib/server/vectors/columns';
import { rowsToArrowIPC, type VectorRow, type ProfileRow } from '../src/lib/server/vectors/serialize';
import { deployedEmbeddingVersion } from '../src/lib/server/vectors/deployed';
import { publishArtifact } from './lib/publish-artifact';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const BUCKET = process.env.CATALOG_BUCKET || `${PROJECT}-bgg-viewer-artifacts`;
const TABLES = {
	features: `${PROJECT}.analytics.games_features`,
	gss: `${PROJECT}.analytics.game_similarity_search`,
	lines: `${PROJECT}.analytics.game_product_line`,
	profiles: `${PROJECT}.analytics.similarity_profiles`,
	deployed: `${PROJECT}.monitoring.deployed_models`
};

const version = (v: unknown) => Number(typeof v === 'object' && v !== null && 'value' in v ? (v as { value: unknown }).value : v);

async function main(): Promise<void> {
	const t0 = Date.now();
	const bq = new BigQuery({ projectId: PROJECT });

	console.log('Querying BigQuery…');
	const [[rows], [profiles], deployed] = await Promise.all([
		bq.query({ query: vectorsQuerySql(TABLES) }),
		bq.query({ query: profilesQuerySql(TABLES.profiles) }),
		deployedEmbeddingVersion(bq, TABLES.deployed)
	]);
	if (rows.length === 0) throw new Error('vectors build returned zero rows');
	if (profiles.length === 0) throw new Error('vectors build found no similarity profiles');

	const latest = Math.max(...rows.map((r) => version(r.embedding_version)));
	const older = rows.filter((r) => version(r.embedding_version) < latest).length;
	console.log(`  ${rows.length.toLocaleString()} rows (${older} below v${latest}), ${profiles.length} profiles, deployed v${deployed ?? '? (newest stands in)'}, in ${Date.now() - t0}ms`);

	await publishArtifact({
		prefix: 'vectors',
		pointerName: 'vectors-current.json',
		raw: rowsToArrowIPC(rows as VectorRow[], profiles as ProfileRow[], deployed),
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
