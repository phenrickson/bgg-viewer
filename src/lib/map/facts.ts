/**
 * The game facts the map draws with, pulled from the catalog already in the browser and
 * aligned to the coordinate set's row order. The artifact carries coordinates only; name,
 * weight, ratings, year and category all come from here — one source of truth for game
 * metadata, same rule the similar-explorer bench follows.
 *
 * Column-oriented (typed arrays indexed like `CoordinateSet.ids`) because the renderer
 * touches every row per frame. Category is an int code rather than a string per row — the
 * *primary category*, which is a catalog concept and lives in
 * `$lib/catalog/primary-category`, not here: a list row and a point should be able to say
 * the same thing about the same game.
 */
import { CATEGORY_SLOTS, primaryCategorySql } from '$lib/catalog/primary-category';
import type { CoordinateSet } from './coordinates';

export { CATEGORY_SLOTS };

/**
 * Bad `year_published` values exist in the source data (one working-set game carries 20026).
 * Left alone, a four-digit typo stretches every year-based colour ramp and the timeline to
 * cover twenty thousand years, so a real century collapses to a pixel. Clamped to a range
 * that admits the oldest real board games and a decade of announcements.
 */
export const YEAR_MIN = -4000;
export const YEAR_MAX = new Date().getFullYear() + 10;

export interface GameFacts {
	weight: Float32Array;
	/** BGG's Bayesian-shrunk rating; 0 where BGG hasn't assigned one (most upcoming games). */
	geekRating: Float32Array;
	averageRating: Float32Array;
	year: Int16Array;
	usersRated: Int32Array;
	/** `year >= current year` — the working set's own definition of upcoming. */
	upcoming: Uint8Array;
	/** 0 = other / none, 1..CATEGORY_SLOTS index into `categoryLabels`. */
	category: Uint8Array;
	/** `categoryLabels[0]` is the "other" label; 1.. are the top categories by count. */
	categoryLabels: string[];
	/** Working-set games in the catalog with no row in the artifact. */
	missing: number;
	name: (id: number) => string;
}

export interface FactRowColumns {
	game_id: ArrayLike<number>;
	average_weight: ArrayLike<number>;
	geek_rating: ArrayLike<number>;
	average_rating: ArrayLike<number>;
	year_published: ArrayLike<number>;
	users_rated: ArrayLike<number>;
	cat_code: ArrayLike<number>;
}

/** Pure alignment step — exported for tests. `cols` may be in any order and may include
 * games the artifact lacks (counted as missing) or lack games the artifact has (left 0). */
export function alignFacts(
	coords: CoordinateSet,
	cols: FactRowColumns,
	categoryLabels: string[],
	currentYear: number,
	name: (id: number) => string
): GameFacts {
	const n = coords.ids.length;
	const weight = new Float32Array(n);
	const geekRating = new Float32Array(n);
	const averageRating = new Float32Array(n);
	const year = new Int16Array(n);
	const usersRated = new Int32Array(n);
	const upcoming = new Uint8Array(n);
	const category = new Uint8Array(n);
	let missing = 0;
	for (let r = 0; r < cols.game_id.length; r++) {
		const i = coords.index.get(Number(cols.game_id[r]));
		if (i === undefined) {
			missing++;
			continue;
		}
		const w = Number(cols.average_weight[r]);
		weight[i] = Number.isFinite(w) ? w : 0;
		const g = Number(cols.geek_rating[r]);
		geekRating[i] = Number.isFinite(g) ? g : 0;
		const a = Number(cols.average_rating[r]);
		averageRating[i] = Number.isFinite(a) ? a : 0;
		const raw = Number(cols.year_published[r]);
		const y = Number.isFinite(raw) && raw >= YEAR_MIN && raw <= YEAR_MAX ? raw : 0;
		year[i] = y;
		usersRated[i] = Number(cols.users_rated[r]) || 0;
		upcoming[i] = y > 0 && y >= currentYear ? 1 : 0;
		const c = Number(cols.cat_code[r]) || 0;
		category[i] = c > 0 && c <= CATEGORY_SLOTS ? c : 0;
	}
	return { weight, geekRating, averageRating, year, usersRated, upcoming, category, categoryLabels, missing, name };
}

/**
 * The facts query. The category code is the *primary category* — see
 * `$lib/catalog/primary-category`, which owns the curated list, the priority order and the
 * `CASE` that derives the code. This function only decides which columns the map wants.
 */
export function factsSql(labels?: string[], priority?: string[]): string {
	const code = primaryCategorySql(labels, priority);
	return `SELECT game_id, average_weight, geek_rating, average_rating, year_published, users_rated, ${code} AS cat_code
		FROM catalog`;
}

export const FACT_COLUMNS = [
	'game_id',
	'average_weight',
	'geek_rating',
	'average_rating',
	'year_published',
	'users_rated',
	'cat_code'
] as const;
