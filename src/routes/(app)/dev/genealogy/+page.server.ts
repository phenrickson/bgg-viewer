import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Prototype: one game's genealogy over the embedding. Its data (the shipped vectors artifact
 * and the catalog) would work in production; whether it comes out of dev is a product call.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
