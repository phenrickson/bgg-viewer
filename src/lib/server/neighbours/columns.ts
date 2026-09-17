/**
 * The tour's neighbours artifact: for each game the guided tour points at, its nearest
 * games by the *engine's own* measure — cosine distance on the full 64-d embedding, the
 * same `ML.DISTANCE(…, 'COSINE')` the warehouse's `game_neighbors` model uses. The map's
 * 6 shipped PCs can only approximate that (and PC1 is mostly weight, so they over-reward
 * similar complexity); the tour says "this is what the engine does", so it shows the real
 * thing. A few dozen sources × the working set is ~1M pairs — cheap.
 *
 * Two ranks per source: overall, and among upcoming games only (the "what's coming that
 * sits near X" step). `N_PER_SOURCE` is the ceiling any step may ask for.
 */
import { WORKING_SET_WHERE } from '../catalog/columns';
import { GAMES } from '$lib/map/story';

/** Games the artifact carries neighbours for — everything the tour references. */
export const SOURCE_IDS: number[] = [...new Set(Object.values(GAMES))].sort((a, b) => a - b);

/** Neighbours kept per source per rank. */
export const N_PER_SOURCE = 25;

export function neighboursQuerySql(featuresTable: string, embeddingsTable: string): string {
	return `WITH src AS (
			SELECT game_id, embedding, embedding_version, embedding_model
			FROM \`${embeddingsTable}\`
			WHERE game_id IN UNNEST(@ids)
		),
		cand AS (
			SELECT f.game_id, e.embedding, e.embedding_version,
				f.year_published >= EXTRACT(YEAR FROM CURRENT_DATE()) AS upcoming
			FROM \`${featuresTable}\` f
			JOIN \`${embeddingsTable}\` e USING (game_id)
			WHERE ${WORKING_SET_WHERE}
		),
		pairs AS (
			SELECT s.game_id AS source_id, c.game_id, c.upcoming,
				1 - ML.DISTANCE(s.embedding, c.embedding, 'COSINE') AS similarity,
				s.embedding_version, s.embedding_model
			FROM src s
			JOIN cand c ON c.embedding_version = s.embedding_version AND c.game_id != s.game_id
		),
		ranked AS (
			SELECT *,
				ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY similarity DESC) AS rk,
				ROW_NUMBER() OVER (PARTITION BY source_id, upcoming ORDER BY similarity DESC) AS rk_upcoming
			FROM pairs
		)
		SELECT source_id, game_id, upcoming, similarity, embedding_version, embedding_model
		FROM ranked
		WHERE rk <= @n OR (upcoming AND rk_upcoming <= @n)
		ORDER BY source_id, similarity DESC`;
}
