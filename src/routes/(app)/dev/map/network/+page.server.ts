import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Prototype: the embedding as a network — one game's ego network in the kNN graph. Reads
 * the dev-only similarity dataset (full 64-d vectors), so dev-only by construction.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
