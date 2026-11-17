import { requireUser } from '$lib/server/bggcon/gate';
import { warehouseClient } from '$lib/server/warehouse';
import type { PageServerLoad } from './$types';

/**
 * The BGG.CON library analytics (spec: docs/superpowers/specs/2026-11-17-bggcon-analytics-design.md).
 * Open to any signed-in user, like /bggcon. The page's own check matters: the (app) layout guard
 * runs in parallel with this load, so it can't stop the warehouse call by itself.
 *
 * A warehouse failure renders as a message on the page, never a 500.
 */
export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals.user);
	try {
		// Built inside the try: warehouseClient() throws synchronously when WAREHOUSE_API_URL is unset.
		const client = warehouseClient();
		const [activity, games] = await Promise.all([client.getBggconActivity(), client.getBggconGames()]);
		return { activity, games, error: null };
	} catch (e) {
		return { activity: null, games: null, error: e instanceof Error ? e.message : String(e) };
	}
};
