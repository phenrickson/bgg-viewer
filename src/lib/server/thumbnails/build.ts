/**
 * Materialize the thumbnails artifact from BigQuery: a narrow scan of the working set
 * (`game_id`, `thumbnail` only, ~35k rows) → Arrow IPC bytes. Mirrors `catalog/build.ts`'s
 * shape — same source table, same project/table wiring — for a much smaller query.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';
import { thumbnailsQuerySql } from './columns';
import { rowsToArrowIPC, type ThumbnailRow } from './serialize';

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const FEATURES_TABLE = `${PROJECT}.analytics.games_features`;

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

export async function fetchThumbnails(client: BigQuery = bq()): Promise<ThumbnailRow[]> {
	const [rows] = await client.query({ query: thumbnailsQuerySql(FEATURES_TABLE) });
	return rows as ThumbnailRow[];
}

/** Build the thumbnails artifact bytes (Arrow IPC) from BigQuery. */
export async function buildThumbnailsArtifact(): Promise<Uint8Array> {
	return rowsToArrowIPC(await fetchThumbnails());
}
