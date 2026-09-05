/**
 * The three precomputed neighbour lists the warehouse serves for a game, and how the
 * game-detail switcher picks between them. One source of truth for the names, shared by
 * `+page.server.ts` (resolving `?profile=`) and `+page.svelte` (the segmented control).
 *
 * Mirrors `analytics.game_neighbors` in bgg-data-warehouse — see
 * `includes/similarity_profiles.js` there. The wire keys (`similar` / `recommender` /
 * `sicko`) never change; only the labels shown to the reader do. `similar` is computed for
 * every game; `recommender` and `sicko` can be empty for a low-rating game, which the
 * switcher renders as a disabled tab. `recommender` is the default view, falling back to
 * `similar` when it has no list for this game.
 */

export const SIMILAR_PROFILES = ['similar', 'recommender', 'sicko'] as const;
export type SimilarProfile = (typeof SIMILAR_PROFILES)[number];

/** A neighbour row as the game-detail card renders it (`similarity = 1 - distance`).
 *  `average` / `geek` are null on a warehouse deployed before bgg-data-warehouse #112. */
export interface SimilarGame {
	id: number;
	name: string;
	year: number | null;
	similarity: number;
	average: number | null;
	geek: number | null;
}

/** An empty list for every profile — the offline / no-data shape. `Record<SimilarProfile,
 *  …>` fails to compile if a profile is added without a key here. */
export const emptySimilarByProfile = (): Record<SimilarProfile, SimilarGame[]> => ({
	similar: [],
	recommender: [],
	sicko: []
});

export const DEFAULT_SIMILAR_PROFILE: SimilarProfile = 'recommender';

/**
 * Which profile to land on when the requested one isn't available for this game: the
 * default (`recommender`), then the always-computed `similar`. `sicko` is never an
 * automatic landing spot.
 */
const RESOLVE_ORDER: readonly SimilarProfile[] = ['recommender', 'similar'];

export const SIMILAR_PROFILE_LABELS: Record<SimilarProfile, string> = {
	similar: 'Most Similar',
	recommender: 'Recommended',
	sicko: 'Dark Horses'
};

/** One-line description shown under the switcher, swapping with the active tab. */
export const SIMILAR_PROFILE_BLURBS: Record<SimilarProfile, string> = {
	similar: 'The games most similar to this one.',
	recommender: 'Well known games similar to this one.',
	sicko: 'Lesser known (or newly released) games similar to this one.'
};

export function isSimilarProfile(x: unknown): x is SimilarProfile {
	return typeof x === 'string' && (SIMILAR_PROFILES as readonly string[]).includes(x);
}

/**
 * The profile to render, given the raw `?profile=` param and which profiles actually have
 * a list for this game. An unknown value, or a known one that's empty for this game
 * (`sicko`/`recommender` below their rating floors), falls back down `RESOLVE_ORDER` —
 * the switcher still shows the requested tab, just disabled.
 */
export function resolveSimilarProfile(
	raw: string | null | undefined,
	available: readonly SimilarProfile[]
): SimilarProfile {
	if (isSimilarProfile(raw) && available.includes(raw)) return raw;
	return RESOLVE_ORDER.find((p) => available.includes(p)) ?? DEFAULT_SIMILAR_PROFILE;
}
