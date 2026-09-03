/**
 * The thumbnails artifact's shape — enough to dress a "similar games" row without loading
 * the full catalog + DuckDB: box art, plus `geek_rating` for the row's rating badge.
 * Deliberately not part of `catalog/columns.ts`: bundling these into the main 24-column
 * artifact was measured to add real weight to the one interaction (first filter) that's
 * already slowest, so it ships as its own artifact instead, fetched after the catalog is
 * already usable. See docs/superpowers/specs/2026-08-18-prelaunch-polish-track2-design.md.
 */
import { WORKING_SET_WHERE } from '../catalog/columns';

export function thumbnailsQuerySql(featuresTable: string): string {
	// Reuses the catalog's own working-set filter (not a copy of the same string) so the two
	// artifacts can never silently drift onto different row sets.
	return `SELECT f.game_id, f.thumbnail, f.geek_rating
		FROM \`${featuresTable}\` f
		WHERE ${WORKING_SET_WHERE}
		ORDER BY f.game_id`;
}
