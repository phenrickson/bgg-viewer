/**
 * Where the Recommend page gets its answer, and which part of it each mode shows.
 *
 * The reader picks a POOL (my shelf / games I don't own / anywhere) and a MODE (Best match /
 * Surprise me). How the page answers is its own business and never shows as a choice:
 *
 *   seed               my shelf           games I don't own     anywhere
 *   on the shelf       artifact A         artifact C            precomputed game_neighbors
 *   near-miss (D)      artifact D         catalog minus owned   precomputed game_neighbors
 *   anything else      live `collection`  catalog minus owned   precomputed game_neighbors
 *
 * "Artifact" is the per-collection neighbours table in DuckDB; "live" is the warehouse's
 * pooled query (~3 s). "Catalog minus owned" falls back to the live `exclude` pool when the
 * precomputed top 10 has too few games you don't own.
 */

export const POOLS = ['shelf', 'unowned', 'all'] as const;
export type Pool = (typeof POOLS)[number];

export const MODES = ['best', 'surprise'] as const;
export type Mode = (typeof MODES)[number];

export type Source =
	| { kind: 'artifact'; part: 'A' | 'C' | 'D' }
	| { kind: 'catalog' }
	| { kind: 'catalog-minus-owned' }
	| { kind: 'live'; pool: 'collection' | 'exclude' };

export function sourceFor(pool: Pool, seedOwned: boolean, seedIsNearMiss: boolean): Source {
	if (pool === 'all') return { kind: 'catalog' };
	if (pool === 'unowned') return seedOwned ? { kind: 'artifact', part: 'C' } : { kind: 'catalog-minus-owned' };
	if (seedOwned) return { kind: 'artifact', part: 'A' };
	if (seedIsNearMiss) return { kind: 'artifact', part: 'D' };
	return { kind: 'live', pool: 'collection' };
}

/** Below this many games left after removing owned ones, run the live `exclude` query. */
export const MIN_AFTER_OWNED = 3;

/** A neighbour id and its similarity (0..1), best first. */
export interface Hit {
	id: number;
	similarity: number;
}

/**
 * What a source returned. Catalog-side sources carry the three precomputed styles; shelf-side
 * ones (A, D, live `collection`) carry one plain-similarity list until the collection-mode
 * profiles exist.
 */
export type Lists =
	| { kind: 'styles'; similar: Hit[]; recommender: Hit[]; sicko: Hit[] }
	| { kind: 'shelf'; list: Hit[] };

export const BEST_COUNT = 10;
/** Shelf Surprise, until the collection-mode Surprise profile replaces it: ranks 5–20. */
export const SHELF_SURPRISE = { from: 4, to: 20 } as const;

/**
 * The list a mode shows.
 *
 *   Best match   catalog: `recommender` (falling back to `similar`)  · shelf: ranks 1–10
 *   Surprise me  catalog: `sicko` (falling back to `recommender`)    · shelf: ranks 5–20 (stub)
 *
 * Surprise is a different, wider list than Best match — never a re-roll of the same one.
 */
export function listFor(lists: Lists, mode: Mode): Hit[] {
	if (lists.kind === 'shelf') {
		return mode === 'best'
			? lists.list.slice(0, BEST_COUNT)
			: lists.list.slice(SHELF_SURPRISE.from, SHELF_SURPRISE.to);
	}
	const pick = (...lists: Hit[][]) => lists.find((l) => l.length) ?? [];
	return mode === 'best'
		? pick(lists.recommender, lists.similar).slice(0, BEST_COUNT)
		: pick(lists.sicko, lists.recommender, lists.similar);
}

/** Drop the given ids from every list — owned games for "games I don't own", the trail. */
export function withoutIds(lists: Lists, drop: ReadonlySet<number>): Lists {
	const keep = (l: Hit[]) => l.filter((h) => !drop.has(h.id));
	return lists.kind === 'shelf'
		? { kind: 'shelf', list: keep(lists.list) }
		: { kind: 'styles', similar: keep(lists.similar), recommender: keep(lists.recommender), sicko: keep(lists.sicko) };
}

/** Too few games left in the list Best match would show? */
export function tooThin(lists: Lists): boolean {
	return listFor(lists, 'best').length < MIN_AFTER_OWNED;
}
