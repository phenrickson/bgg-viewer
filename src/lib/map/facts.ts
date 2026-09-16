/**
 * The game facts the map draws with, pulled from the catalog already in the browser and
 * aligned to the coordinate set's row order. The artifact carries coordinates only; name,
 * weight, ratings, year and category all come from here — one source of truth for game
 * metadata, same rule the similar-explorer bench follows.
 *
 * Column-oriented (typed arrays indexed like `CoordinateSet.ids`) because the renderer
 * touches every row per frame. Category is an int code into `categoryLabels` rather than a
 * string per row: the palette has seven slots, so the curated categories get codes 1..7
 * and everything else is 0 ("other").
 */
import type { CoordinateSet } from './coordinates';

export const CATEGORY_SLOTS = 7;

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
		const y = Number(cols.year_published[r]);
		year[i] = Number.isFinite(y) ? y : 0;
		usersRated[i] = Number(cols.users_rated[r]) || 0;
		upcoming[i] = Number.isFinite(y) && y >= currentYear ? 1 : 0;
		const c = Number(cols.cat_code[r]) || 0;
		category[i] = c > 0 && c <= CATEGORY_SLOTS ? c : 0;
	}
	return { weight, geekRating, averageRating, year, usersRated, upcoming, category, categoryLabels, missing, name };
}

/**
 * A game takes the first of `labels` (see `categories.ts` — order is priority) that it
 * carries anywhere in its category list; none of them → 0 (Other). Earlier cuts used
 * `categories[1]` (BGG lists alphabetically, so that was arbitrary) and then the six most
 * frequent tags (format tags and catch-alls); a curated list is what makes the map legible.
 */
export function factsSql(labels: string[]): string {
	const esc = (s: string) => s.replace(/'/g, "''");
	const cases = labels
		.slice(0, CATEGORY_SLOTS)
		.map((l, i) => `WHEN list_contains(categories, '${esc(l)}') THEN ${i + 1}`)
		.join(' ');
	const code = labels.length ? `CASE ${cases} ELSE 0 END` : '0';
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
