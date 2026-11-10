/**
 * Does the browser's ranking (`src/lib/recommend/rank.ts`) reproduce the warehouse's?
 *
 * Builds the vectors artifact in memory from the same `columns.ts` / `serialize.ts` CI uses,
 * parses it with the client reader, ranks five well-known seeds "anywhere" with `rankCatalog`,
 * and compares every profile's list with `analytics.game_neighbors`. Same games in the same
 * order, or it fails. Run it when a profile or the ranking code changes.
 * Spec: docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md (Verification).
 *
 * Usage: tsx scripts/check-vectors-fidelity.ts
 */
import { BigQuery } from '@google-cloud/bigquery';
import { vectorsQuerySql, profilesQuerySql } from '../src/lib/server/vectors/columns';
import { rowsToArrowIPC, type VectorRow, type ProfileRow } from '../src/lib/server/vectors/serialize';
import { parseVectors } from '../src/lib/recommend/vectors';
import { rankCatalog } from '../src/lib/recommend/rank';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const TABLES = {
	features: `${PROJECT}.analytics.games_features`,
	gss: `${PROJECT}.analytics.game_similarity_search`,
	lines: `${PROJECT}.analytics.game_product_line`,
	profiles: `${PROJECT}.analytics.similarity_profiles`
};
/** Wingspan, Brass: Birmingham, Take 5, Catan, Azul. */
const SEEDS = [266192, 224517, 432, 13, 230802];

async function main(): Promise<void> {
	const bq = new BigQuery({ projectId: PROJECT });
	const [[rows], [profiles], [neighbors]] = await Promise.all([
		bq.query({ query: vectorsQuerySql(TABLES) }),
		bq.query({ query: profilesQuerySql(TABLES.profiles) }),
		bq.query({
			query: `SELECT profile, game_id, ARRAY(SELECT s.game_id FROM UNNEST(similar) s) AS ids
			        FROM \`${PROJECT}.analytics.game_neighbors\` WHERE game_id IN UNNEST(@seeds)`,
			params: { seeds: SEEDS }
		})
	]);
	const v = parseVectors(rowsToArrowIPC(rows as VectorRow[], profiles as ProfileRow[]));

	let same = 0;
	for (const n of neighbors as { profile: 'similar' | 'recommender' | 'sicko'; game_id: number; ids: number[] }[]) {
		const want = n.ids.map(Number);
		const got = rankCatalog(v, Number(n.game_id), new Set())[n.profile].map((h) => h.id);
		const ok = JSON.stringify(got) === JSON.stringify(want);
		if (ok) same++;
		console.log(`${ok ? 'ok  ' : 'DIFF'} ${n.game_id}/${n.profile}${ok ? '' : `\n     want ${want.join(',')}\n     got  ${got.join(',')}`}`);
	}
	console.log(`${same}/${neighbors.length} identical`);
	if (same !== neighbors.length || neighbors.length !== SEEDS.length * 3) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
