import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The embedding map's guided tour — a scrollytelling walk through the same map `/dev/map`
 * explores freely. Dev-only for the same reason: every word of it is PLACEHOLDER until Phil
 * writes the copy and picks the games it points at (see `$lib/map/story.ts`).
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
