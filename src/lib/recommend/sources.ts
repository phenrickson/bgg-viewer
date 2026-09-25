/**
 * Where the Recommend page gets its answer, and which part of it each mode shows.
 *
 * The reader picks a POOL (my shelf / games I don't own / anywhere). How the page answers is
 * its own business and never shows as a choice:
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

/** A section lists at most this many; the page shows fewer until "All" is asked for. */
export const SECTION_MAX = 10;
/** Shelf Surprise, until the collection-mode Surprise profile replaces it: ranks 5–20. */
export const SHELF_SURPRISE = { from: 4, to: 20 } as const;

/** The three precomputed lists, in the order the page stacks them. */
export const STYLE_ORDER = ['recommender', 'similar', 'sicko'] as const;
export type SectionKey = (typeof STYLE_ORDER)[number] | 'shelf';

export interface Section {
	key: SectionKey;
	hits: Hit[];
}

/**
 * The sections the page stacks, top to bottom: the three precomputed lists
 * (Recommended, Most similar, Dark horses) or the one shelf list. An empty section is left
 * out rather than shown empty.
 */
export function sectionsFor(lists: Lists): Section[] {
	const all: Section[] =
		lists.kind === 'shelf'
			? [{ key: 'shelf', hits: lists.list }]
			: STYLE_ORDER.map((key) => ({ key, hits: lists[key] }));
	return all.map((s) => ({ ...s, hits: s.hits.slice(0, SECTION_MAX) })).filter((s) => s.hits.length);
}

/**
 * What Surprise me draws from — wider than the top of the page, never a re-roll of it:
 * Dark horses (falling back to Recommended, then Most similar), or ranks 5–20 of a shelf list.
 */
export function surpriseFrom(lists: Lists): Hit[] {
	if (lists.kind === 'shelf') return lists.list.slice(SHELF_SURPRISE.from, SHELF_SURPRISE.to);
	return [lists.sicko, lists.recommender, lists.similar].find((l) => l.length) ?? [];
}

/** Drop the given ids from every list — owned games for "games I don't own", the trail. */
export function withoutIds(lists: Lists, drop: ReadonlySet<number>): Lists {
	const keep = (l: Hit[]) => l.filter((h) => !drop.has(h.id));
	return lists.kind === 'shelf'
		? { kind: 'shelf', list: keep(lists.list) }
		: { kind: 'styles', similar: keep(lists.similar), recommender: keep(lists.recommender), sicko: keep(lists.sicko) };
}

/** Too few games left at the top of the page (Recommended, or Most similar without it)? */
export function tooThin(lists: Lists): boolean {
	const top = lists.kind === 'shelf' ? lists.list : lists.recommender.length ? lists.recommender : lists.similar;
	return top.length < MIN_AFTER_OWNED;
}

/**
 * One Surprise draw: a random hit not yet seen this visit. Once every hit has been seen the
 * draw starts over (minus the one just shown, so it never repeats back to back).
 */
export function drawFrom(
	hits: Hit[],
	seen: ReadonlySet<number>,
	random: () => number = Math.random
): { hit: Hit | null; seen: Set<number> } {
	if (!hits.length) return { hit: null, seen: new Set(seen) };
	let fresh = hits.filter((h) => !seen.has(h.id));
	let next = new Set(seen);
	if (!fresh.length) {
		const last = [...seen].at(-1);
		fresh = hits.length > 1 ? hits.filter((h) => h.id !== last) : hits;
		next = new Set();
	}
	const hit = fresh[Math.floor(random() * fresh.length)];
	next.add(hit.id);
	return { hit, seen: next };
}
