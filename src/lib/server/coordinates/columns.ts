/**
 * The coordinates artifact's shape: where every working-set game sits in the embedding
 * space. The first `K_COMPONENTS` PCA components plus the 2-D UMAP — nothing else. Game
 * facts (name, weight, ratings…) come from the catalog already in the browser; this
 * artifact is coordinates only, so it stays ~1 MB and is fetched lazily by the map page.
 * See docs/superpowers/specs/2026-09-16-embedding-map-explore-design.md.
 *
 * The production embedding *is* a 64-component PCA, so `pca_1`/`pca_2` in the coordinates
 * table are exactly `embedding[0]`/`embedding[1]` — more components means reading more of
 * the vector, not fitting anything new. `embedding_8` is the pre-truncated first eight,
 * a quarter the bytes of the full column, so that's the source and 8 is the ceiling on K.
 */
import { WORKING_SET_WHERE } from '../catalog/columns';

/** How many PCA components ship. Raise (≤ 8) once PC3+ have been looked at. */
export const K_COMPONENTS = 6;

const EMBEDDING_COLUMN = 'embedding_8';
const EMBEDDING_COLUMN_WIDTH = 8;

if (K_COMPONENTS > EMBEDDING_COLUMN_WIDTH) {
	throw new Error(`K_COMPONENTS (${K_COMPONENTS}) exceeds ${EMBEDDING_COLUMN} width (${EMBEDDING_COLUMN_WIDTH})`);
}

/** `pc_1 … pc_K` — the artifact's component column names, in order. */
export const PC_COLUMNS = Array.from({ length: K_COMPONENTS }, (_, i) => `pc_${i + 1}`);

export function coordinatesQuerySql(
	featuresTable: string,
	embeddingsTable: string,
	coordinatesTable: string
): string {
	const pcs = PC_COLUMNS.map((name, i) => `e.${EMBEDDING_COLUMN}[OFFSET(${i})] AS ${name}`).join(',\n\t\t\t');
	// The two prediction tables are written by different daily jobs; joining on version as
	// well as game_id means a model bump that has landed in one but not the other yields
	// zero rows (and a loud build failure downstream) instead of a map mixing two spaces.
	// Reuses the catalog's own working-set filter (not a copy) so the row set can't drift.
	return `SELECT f.game_id,
			${pcs},
			c.umap_1, c.umap_2,
			e.embedding_version, e.embedding_model
		FROM \`${featuresTable}\` f
		JOIN \`${embeddingsTable}\` e USING (game_id)
		JOIN \`${coordinatesTable}\` c USING (game_id)
		WHERE ${WORKING_SET_WHERE}
			AND e.embedding_version = c.embedding_version
		ORDER BY f.game_id`;
}
