/**
 * PROTOTYPE: build the collection-neighbours artifact for one or more BGG usernames and
 * write it to the local cache (`.cache/collection-neighbors/<username>.arrow`).
 *
 *   pnpm dlx tsx@4 scripts/build-collection-neighbors.ts phenrickson --dry-run
 *   pnpm dlx tsx@4 scripts/build-collection-neighbors.ts phenrickson
 *
 * `--dry-run` asks BigQuery for bytes only — nothing is billed and nothing is written.
 * Each real query is capped at 300 MB billed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { BigQuery } from '@google-cloud/bigquery';
import { partASql, partCSql, partDSql, type Tables } from '../src/lib/server/collection-neighbors/columns';
import { rowsToArrowIPC, type NeighbourRow } from '../src/lib/server/collection-neighbors/serialize';
import { CACHE_DIR, cachePath } from '../src/lib/server/collection-neighbors/cache';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const TABLES: Tables = {
	gss: `${PROJECT}.analytics.game_similarity_search`,
	profiles: `${PROJECT}.analytics.similarity_profiles`,
	lines: `${PROJECT}.analytics.game_product_line`,
	collections: `${PROJECT}.collections.user_collections`
};
const MAX_BYTES = String(300_000_000);

const bq = new BigQuery({ projectId: PROJECT });
const mb = (b: unknown) => (Number(b) / 1e6).toFixed(1);

async function dry(label: string, query: string, params: Record<string, unknown>): Promise<number> {
	const [job] = await bq.createQueryJob({ query, params, dryRun: true });
	const bytes = Number(job.metadata.statistics.totalBytesProcessed);
	console.log(`  ${label}: dry-run ${mb(bytes)} MB`);
	return bytes;
}

async function run(label: string, query: string, params: Record<string, unknown>): Promise<NeighbourRow[]> {
	const t0 = Date.now();
	const [job] = await bq.createQueryJob({ query, params, maximumBytesBilled: MAX_BYTES });
	const [rows] = await job.getQueryResults();
	const [meta] = await job.getMetadata();
	console.log(
		`  ${label}: ${rows.length.toLocaleString()} rows, ${((Date.now() - t0) / 1000).toFixed(1)}s, ` +
			`billed ${mb(meta.statistics.query.totalBytesBilled)} MB`
	);
	return rows as NeighbourRow[];
}

async function build(username: string, dryRun: boolean): Promise<void> {
	console.log(`${username}${dryRun ? ' (dry run)' : ''}`);
	if (dryRun) {
		const total =
			(await dry('A owned→owned', partASql(TABLES), { username })) +
			(await dry('C owned→not owned', partCSql(TABLES), { username })) +
			(await dry('D near-miss→owned', partDSql(TABLES), { username, seeds: [13] }));
		console.log(`  total ${mb(total)} MB  (~$${((total / 1e12) * 6.25).toFixed(4)})`);
		return;
	}
	const a = await run('A owned→owned', partASql(TABLES), { username });
	const c = await run('C owned→not owned', partCSql(TABLES), { username });
	const seeds = [...new Set(c.map((r) => Number((r.neighbor_id as { value?: unknown })?.value ?? r.neighbor_id)))];
	console.log(`  D seeds: ${seeds.length.toLocaleString()} not-owned games from C`);
	const d = seeds.length ? await run('D near-miss→owned', partDSql(TABLES), { username, seeds }) : [];

	const rows = [...a, ...c, ...d];
	const bytes = rowsToArrowIPC(rows, username, new Date().toISOString());
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(cachePath(username), bytes);
	console.log(`  wrote ${cachePath(username)}: ${rows.length.toLocaleString()} rows, ${(bytes.byteLength / 1024).toFixed(0)} KB`);
}

async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');
	const usernames = process.argv.slice(2).filter((a) => !a.startsWith('--'));
	if (!usernames.length) throw new Error('usage: build-collection-neighbors.ts <username...> [--dry-run]');
	for (const u of usernames) await build(u, dryRun);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
