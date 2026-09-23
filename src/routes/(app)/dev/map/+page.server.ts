import { redirect } from '@sveltejs/kit';
import { MAP_PATH } from '$lib/map/route';
import type { PageServerLoad } from './$types';

/**
 * The map's old address. It ran here, unlisted, until it was promoted to `/map` under Tools;
 * links made in that time carry a scope in the querystring, so the redirect keeps it.
 *
 * Only this exact path. `/dev/map/story` and `/dev/map/network` are still prototypes, gated
 * on their own, and resolve as before.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(308, MAP_PATH + url.search);
};
