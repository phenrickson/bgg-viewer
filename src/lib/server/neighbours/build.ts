/**
 * Materialize the tour's neighbours artifact from BigQuery → JSON bytes. Small (a few
 * dozen sources × 2 × 25 ids), so JSON rather than Arrow; cached like the coordinates.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';
import { neighboursQuerySql, SOURCE_IDS, N_PER_SOURCE } from './columns';
import type { NeighboursArtifact, Neighbour } from '$lib/map/neighbours';

export type { NeighboursArtifact, Neighbour };

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const FEATURES_TABLE = `${PROJECT}.analytics.games_features`;
const EMBEDDINGS_TABLE = `${PROJECT}.predictions.bgg_game_embeddings`;

export interface NeighbourRow {
	source_id: unknown;
	game_id: unknown;
	upcoming: boolean;
	similarity: number;
	embedding_version: unknown;
	embedding_model: string;
}

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

/** BigQuery returns INT64 as a `{ value: string }` wrapper (or a number); normalize. */
function num(v: unknown): number {
	if (typeof v === 'object' && v !== null && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

export async function fetchNeighbourRows(client: BigQuery = bq()): Promise<NeighbourRow[]> {
	const [rows] = await client.query({
		query: neighboursQuerySql(FEATURES_TABLE, EMBEDDINGS_TABLE),
		params: { ids: SOURCE_IDS, n: N_PER_SOURCE }
	});
	return rows as NeighbourRow[];
}

/** Pure shaping step — exported for tests. Rows arrive best-first per source. */
export function rowsToArtifact(rows: NeighbourRow[], n: number = N_PER_SOURCE): NeighboursArtifact {
	if (rows.length === 0) throw new Error('neighbours build returned zero rows');
	const versions = new Set(rows.map((r) => num(r.embedding_version)));
	const models = new Set(rows.map((r) => r.embedding_model));
	if (versions.size > 1 || models.size > 1) {
		throw new Error(`neighbours artifact spans ${versions.size} versions / ${models.size} models`);
	}
	const all: Record<string, Neighbour[]> = {};
	const upcoming: Record<string, Neighbour[]> = {};
	for (const r of rows) {
		const src = String(num(r.source_id));
		const nb = { id: num(r.game_id), sim: Number(r.similarity) };
		// A row can be in the overall top-n, the upcoming top-n, or both; the overall list is
		// simply the first n rows per source since they arrive sorted.
		if ((all[src] ??= []).length < n) all[src].push(nb);
		if (r.upcoming && (upcoming[src] ??= []).length < n) upcoming[src].push(nb);
	}
	return { model: [...models][0], version: [...versions][0], n, all, upcoming };
}

export async function buildNeighboursArtifact(): Promise<Uint8Array> {
	return new TextEncoder().encode(JSON.stringify(rowsToArtifact(await fetchNeighbourRows())));
}
