import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * A local review page for new/edited vizzes — renders every entry in content.json with the
 * exact component the real landing page uses, so what you see here is what ships. Never
 * reachable outside `pnpm dev`: no reason to ship a page full of PLACEHOLDER copy and unfinished
 * charts to production, and gating it this way sidesteps the question entirely rather than
 * relying on auth alone.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404);
};
