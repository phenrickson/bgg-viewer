import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * A local preview of the shared game components — each in every size and state, on real
 * catalog games — so their shape gets settled here before a page depends on them. Never
 * reachable outside `pnpm dev`, like `/dev/vizzes`.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
