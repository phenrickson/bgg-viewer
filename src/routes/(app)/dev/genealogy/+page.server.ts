import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Prototype: one game's genealogy over the embedding. Reads the dev-only similarity
 * dataset (full 64-d vectors), so dev-only by construction.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
