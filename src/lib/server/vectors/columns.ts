/**
 * The vectors artifact's query: one row per working-set game with its 64-d embedding and the
 * columns the Recommend tool ranks with, so the browser can answer "games like X" inside a
 * pool (my shelf, games I don't own) without a BigQuery round trip per click.
 * Spec: docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md §1.
 *
 * - Rows: the catalog's own working set (`WORKING_SET_WHERE`, imported, not copied), so every
 *   game the search can offer as a seed has a vector.
 * - Ranking columns come from `game_similarity_search` — what `game_neighbors` ranks with —
 *   not the catalog's features, so the browser's lists can match the warehouse's exactly.
 * - `geek_pct` is the percentile of `geek_rating` over EVERY rated game in that table, as
 *   `game_neighbors` computes it; ranking it within the working set would shift every score.
 * - Every `embedding_version` is kept: `game_neighbors` doesn't filter by version either.
 */
import { WORKING_SET_WHERE } from '../catalog/columns';

export interface VectorTables {
	features: string; // analytics.games_features (the working-set filter's `f` alias)
	gss: string; // analytics.game_similarity_search
	lines: string; // analytics.game_product_line
	profiles: string; // analytics.similarity_profiles
	deployed: string; // monitoring.deployed_models
}

export function vectorsQuerySql(t: VectorTables): string {
	return `WITH pct AS (
  SELECT game_id, PERCENT_RANK() OVER (ORDER BY geek_rating) AS geek_pct
  FROM \`${t.gss}\` WHERE geek_rating > 0
),
lines AS (
  SELECT game_id, ANY_VALUE(product_line_id) AS line FROM \`${t.lines}\` GROUP BY game_id
)
SELECT g.game_id, g.embedding, g.complexity, g.users_rated,
       COALESCE(pct.geek_pct, 0) AS geek_pct, lines.line,
       g.embedding_version, g.embedding_model
FROM \`${t.features}\` f
JOIN \`${t.gss}\` g USING (game_id)
LEFT JOIN pct USING (game_id)
LEFT JOIN lines USING (game_id)
WHERE ${WORKING_SET_WHERE}
ORDER BY game_id`;
}

/**
 * The deployed game-embedding version: the one the latest embedding run used, as the
 * warehouse's `monitoring.deployed_models` records it. Recommend keeps every version (to
 * match `game_neighbors`); the genealogy and network compare only games on this one, since
 * a dot product across two embedding runs means nothing. No run in its 30-day window: no row.
 */
export function deployedEmbeddingSql(deployedTable: string): string {
	return `SELECT model_version FROM \`${deployedTable}\`
WHERE model_category = 'game' AND model_type = 'game_embedding'
ORDER BY last_scored DESC LIMIT 1`;
}

/** The ranking rules, shipped in the artifact so the browser never copies them. */
export function profilesQuerySql(profilesTable: string): string {
	return `SELECT * FROM \`${profilesTable}\` ORDER BY name`;
}
