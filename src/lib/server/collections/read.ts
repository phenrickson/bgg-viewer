/**
 * Reads the `collections.user_collections` view — raw per-account BGG collection membership,
 * landed by Dataform from bgg-predictive-models (see
 * docs/superpowers/specs/2026-08-26-collection-filter-design.md). Admin-only in Phase 1: no
 * on-demand fetch, this only reads whatever's already been synced.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { env } from '$env/dynamic/private';

const PROJECT = env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const TABLE = `\`${PROJECT}.collections.user_collections\``;

let _bq: BigQuery | null = null;
function bq(): BigQuery {
	return (_bq ??= new BigQuery({ projectId: PROJECT }));
}

export interface OwnedCollection {
	game_ids: number[];
	/** Latest `updated_at` across the collection — surfaced in the UI as "last synced". */
	updated_at: string | null;
}

export async function fetchOwnedCollection(
	username: string,
	client: BigQuery = bq()
): Promise<OwnedCollection> {
	const [rows] = await client.query({
		query: `SELECT game_id, updated_at FROM ${TABLE} WHERE username = @username AND owned = TRUE`,
		params: { username }
	});
	const game_ids = rows.map((r: { game_id: number }) => Number(r.game_id));
	const updated_at = rows.reduce(
		(latest: string | null, r: { updated_at: { value: string } | string | null }) => {
			const ts = typeof r.updated_at === 'string' ? r.updated_at : (r.updated_at?.value ?? null);
			return ts && (!latest || ts > latest) ? ts : latest;
		},
		null as string | null
	);
	return { game_ids, updated_at };
}
