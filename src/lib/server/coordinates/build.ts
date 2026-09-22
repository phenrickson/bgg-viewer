/**
 * Materialize the coordinates artifact from BigQuery: the working set joined to the two
 * prediction tables (embeddings for the PCA components, coordinates for UMAP) → Arrow IPC
 * bytes. Mirrors `thumbnails/build.ts`. ~20 MB scanned per build, once per TTL.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';
import { coordinatesQuerySql } from './columns';
import { rowsToArrowIPC, type CoordinateRow } from './serialize';

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const FEATURES_TABLE = `${PROJECT}.analytics.games_features`;
const EMBEDDINGS_TABLE = `${PROJECT}.predictions.bgg_game_embeddings`;
const COORDINATES_TABLE = `${PROJECT}.predictions.bgg_game_coordinates`;

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

export async function fetchCoordinates(client: BigQuery = bq()): Promise<CoordinateRow[]> {
	const [rows] = await client.query({
		query: coordinatesQuerySql(FEATURES_TABLE, EMBEDDINGS_TABLE, COORDINATES_TABLE)
	});
	return rows as CoordinateRow[];
}

/** Build the coordinates artifact bytes (Arrow IPC) from BigQuery. */
export async function buildCoordinatesArtifact(): Promise<Uint8Array> {
	const rows = await fetchCoordinates();
	if (rows.length === 0) {
		// The version join produced nothing — almost certainly a model bump that has landed in
		// one prediction table but not the other yet. Fail so the cache keeps serving the last
		// good artifact rather than an empty map.
		throw new Error('coordinates build returned zero rows (embedding/coordinate version mismatch?)');
	}
	return rowsToArrowIPC(rows);
}
