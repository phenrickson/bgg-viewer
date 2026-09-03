import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * A local tuning bench for the game page's "Similar games" list — pick a game, toggle
 * exclusion rules and rating/complexity filters, and watch the "most similar" and the
 * filtered list side by side. Never reachable outside `pnpm dev`: it ships a few MB of
 * embeddings and exists only to decide what a future `game_neighbors` profile should do.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
