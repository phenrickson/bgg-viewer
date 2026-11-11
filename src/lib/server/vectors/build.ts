/**
 * Build the vectors artifact from BigQuery — the fallback when the GCS pointer can't be read
 * (fresh bucket, offline mode, `VECTORS_SOURCE=bigquery`). CI builds the same bytes through
 * `scripts/build-vectors-artifact.ts`, from these same `columns.ts` / `serialize.ts`.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';
import { vectorsQuerySql, profilesQuerySql, type VectorTables } from './columns';
import { rowsToArrowIPC, type VectorRow, type ProfileRow } from './serialize';
import { deployedEmbeddingVersion } from './deployed';

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
export const VECTOR_TABLES: VectorTables = {
	features: `${PROJECT}.analytics.games_features`,
	gss: `${PROJECT}.analytics.game_similarity_search`,
	lines: `${PROJECT}.analytics.game_product_line`,
	profiles: `${PROJECT}.analytics.similarity_profiles`,
	deployed: `${PROJECT}.monitoring.deployed_models`
};

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

export async function buildVectorsArtifact(client: Pick<BigQuery, 'query'> = bq()): Promise<Uint8Array> {
	const [[rows], [profiles], deployed] = await Promise.all([
		client.query({ query: vectorsQuerySql(VECTOR_TABLES) }),
		client.query({ query: profilesQuerySql(VECTOR_TABLES.profiles) }),
		deployedEmbeddingVersion(client, VECTOR_TABLES.deployed)
	]);
	// Fail rather than serve an empty or rule-less artifact: the cache keeps the last good one.
	if (rows.length === 0) throw new Error('vectors build returned zero rows');
	if (profiles.length === 0) throw new Error('vectors build found no similarity profiles');
	return rowsToArrowIPC(rows as VectorRow[], profiles as ProfileRow[], deployed);
}
