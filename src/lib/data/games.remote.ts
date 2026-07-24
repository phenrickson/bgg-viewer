/**
 * Remote data functions for games — the browser's only door to warehouse game data.
 *
 * A `query()` runs on the SvelteKit server: it composes the server-only warehouse
 * client (which attaches a Google ID token) so the gated Cloud Run service is reached
 * without ever exposing credentials or the warehouse URL to the client bundle.
 *
 * (Plan called this `remote.remote.ts`; named for its domain instead — list/facets
 * for the catalog will join it here in PR 5.)
 */
import { query } from '$app/server';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { createWarehouseClient } from '$lib/server/warehouse/client';
import { getWarehouseIdToken } from '$lib/server/warehouse/token';

function warehouse() {
	const baseUrl = env.WAREHOUSE_API_URL;
	if (!baseUrl) throw new Error('WAREHOUSE_API_URL is not set — cannot reach the warehouse.');
	return createWarehouseClient({ baseUrl, getIdToken: getWarehouseIdToken });
}

/** Full game document for a detail page. Rejects non-positive ids at the boundary. */
export const getGame = query(z.number().int().positive(), (gameId) => warehouse().getGame(gameId));
