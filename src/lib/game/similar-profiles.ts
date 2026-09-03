/**
 * The three precomputed neighbour lists the warehouse serves for a game, and how the
 * game-detail switcher picks between them. One source of truth for the names, shared by
 * `+page.server.ts` (resolving `?profile=`) and `+page.svelte` (the segmented control).
 *
 * Mirrors `analytics.game_neighbors` in bgg-data-warehouse — see
 * `includes/similarity_profiles.js` there. `similar` is the default: it's computed for
 * every game; `recommender` and `sicko` can be empty for a low-rating game, which the
 * switcher renders as a disabled tab.
 */

export const SIMILAR_PROFILES = ['similar', 'recommender', 'sicko'] as const;
export type SimilarProfile = (typeof SIMILAR_PROFILES)[number];

/** A neighbour row as the game-detail card renders it (`similarity = 1 - distance`). */
export interface SimilarGame {
	id: number;
	name: string;
	year: number | null;
	similarity: number;
}

/** An empty list for every profile — the offline / no-data shape. `Record<SimilarProfile,
 *  …>` fails to compile if a profile is added without a key here. */
export const emptySimilarByProfile = (): Record<SimilarProfile, SimilarGame[]> => ({
	similar: [],
	recommender: [],
	sicko: []
});

export const DEFAULT_SIMILAR_PROFILE: SimilarProfile = 'similar';

/** PLACEHOLDER labels — Phil writes the final copy. */
export const SIMILAR_PROFILE_LABELS: Record<SimilarProfile, string> = {
	similar: 'Similar',
	recommender: 'Recommended',
	sicko: 'Sicko'
};

export function isSimilarProfile(x: unknown): x is SimilarProfile {
	return typeof x === 'string' && (SIMILAR_PROFILES as readonly string[]).includes(x);
}

/**
 * The profile to render, given the raw `?profile=` param and which profiles actually have
 * a list for this game. An unknown value, or a known one that's empty for this game
 * (`sicko` below its rating floor), falls back to the default — the switcher still shows
 * the requested tab, just disabled.
 */
export function resolveSimilarProfile(
	raw: string | null | undefined,
	available: readonly SimilarProfile[]
): SimilarProfile {
	if (isSimilarProfile(raw) && available.includes(raw)) return raw;
	return DEFAULT_SIMILAR_PROFILE;
}
