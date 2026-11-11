/**
 * The deployed embedding version for the vectors artifact's metadata, or null when it can't be
 * read: the viewer's own account has no grant on `monitoring` (only CI's does), and a quiet
 * month leaves `deployed_models` without a row. Null is not a failure: the browser then takes
 * the newest version in the artifact as the active one.
 */
import type { BigQuery } from '@google-cloud/bigquery';
import { deployedEmbeddingSql } from './columns';

export async function deployedEmbeddingVersion(client: Pick<BigQuery, 'query'>, table: string): Promise<number | null> {
	try {
		const [rows] = await client.query({ query: deployedEmbeddingSql(table) });
		const v = Number((rows as { model_version?: unknown }[])[0]?.model_version);
		return Number.isFinite(v) ? v : null;
	} catch (e) {
		console.warn(`[vectors] couldn't read the deployed embedding version (${e instanceof Error ? e.message : e}); the newest in the artifact stands in.`);
		return null;
	}
}
