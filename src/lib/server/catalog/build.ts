/**
 * Materialize the catalog artifact from BigQuery: one narrow scan of the working set
 * (~38k rows, ~40 MB) → Arrow IPC bytes. Run at most on a TTL by the cache, never per
 * request. Reads the same `analytics` dataset the warehouse serves from, plus
 * `predictions` for the model columns.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';
import { catalogQuerySql } from './columns';
import { rowsToArrowIPC, type CatalogRow } from './serialize';

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const FEATURES_TABLE = `${PROJECT}.analytics.games_features`;
const BEST_PLAYER_COUNTS_TABLE = `${PROJECT}.analytics.best_player_counts`;
const PREDICTIONS_TABLE = `${PROJECT}.predictions.bgg_predictions`;

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

export async function fetchWorkingSet(client: BigQuery = bq()): Promise<CatalogRow[]> {
	const [rows] = await client.query({
		query: catalogQuerySql(FEATURES_TABLE, BEST_PLAYER_COUNTS_TABLE, PREDICTIONS_TABLE)
	});
	return rows as CatalogRow[];
}

/** Build the catalog artifact bytes (Arrow IPC) from BigQuery. */
export async function buildCatalogArtifact(): Promise<Uint8Array> {
	return rowsToArrowIPC(await fetchWorkingSet());
}
