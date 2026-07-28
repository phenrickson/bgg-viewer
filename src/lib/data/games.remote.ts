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
import { warehouseClient } from '$lib/server/warehouse';

/** Full game document for a detail page. Rejects non-positive ids at the boundary. */
export const getGame = query(z.number().int().positive(), (gameId) =>
	warehouseClient().getGame(gameId)
);
