import { redirect } from '@sveltejs/kit';
import { findHref } from '$lib/recommend/route';
import type { PageServerLoad } from './$types';

/**
 * Discover's old address. Discover folded into Recommend as "Help me find a game"; its
 * questions are the same Scope params, so the redirect carries them and an old link lands on
 * the same answers.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(308, findHref(url.search));
};
