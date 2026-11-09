/**
 * The shape of Recommend's answer and the small list helpers the page uses.
 *
 * Every pool answers with the same three lists — Recommended, Most similar, Dark horses:
 * *anywhere* from the precomputed `game_neighbors` (via `/api/similar`), *games I don't own* and
 * *my shelf* ranked in the browser (`./rank.ts`). Spec:
 * docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md §2.
 */

export const POOLS = ['shelf', 'unowned', 'all'] as const;
export type Pool = (typeof POOLS)[number];

/** A neighbour id and its similarity (0..1), best first. */
export interface Hit {
	id: number;
	similarity: number;
}

/** One answer: the three lists. */
export interface Lists {
	similar: Hit[];
	recommender: Hit[];
	sicko: Hit[];
}

/** A list shows at most this many. */
export const SECTION_MAX = 10;

export type SectionKey = keyof Lists;

export interface Section {
	key: SectionKey;
	hits: Hit[];
}

/**
 * What Surprise me draws from — wider than the top of the page, never a re-roll of it:
 * Dark horses, falling back to Recommended, then Most similar. (Surprise me is off the page for
 * now; kept for when it returns.)
 */
export function surpriseFrom(lists: Lists): Hit[] {
	return [lists.sicko, lists.recommender, lists.similar].find((l) => l.length) ?? [];
}

/** Drop the given ids from every list — the chosen game itself. */
export function withoutIds(lists: Lists, drop: ReadonlySet<number>): Lists {
	const keep = (l: Hit[]) => l.filter((h) => !drop.has(h.id));
	return { similar: keep(lists.similar), recommender: keep(lists.recommender), sicko: keep(lists.sicko) };
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
