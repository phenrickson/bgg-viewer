/**
 * Server-only typed client for the gated warehouse read API.
 *
 * The browser never calls the warehouse directly — this runs on the SvelteKit
 * server, which attaches a Google-signed ID token so Cloud Run's IAM gate lets
 * the request through (token minting lives in `token.ts`, wired in a later step).
 *
 * Both collaborators — the `fetch` implementation and the ID-token source — are
 * injected, so the client is unit-testable with zero network / GCP access.
 */
import { GameNotFoundError, WarehouseError, type GameDocument } from './types';

export interface WarehouseClientDeps {
	/** Base URL of the warehouse Cloud Run service, e.g. https://warehouse-api-xxx.run.app */
	baseUrl: string;
	/** Returns a Bearer ID token for the warehouse audience. Called per request. */
	getIdToken: () => Promise<string>;
	/** Injectable fetch (defaults to the platform `fetch`); overridden in tests. */
	fetch?: typeof fetch;
}

export interface WarehouseClient {
	getGame(gameId: number): Promise<GameDocument>;
}

export function createWarehouseClient(deps: WarehouseClientDeps): WarehouseClient {
	const doFetch = deps.fetch ?? fetch;
	const base = deps.baseUrl.replace(/\/+$/, ''); // tolerate a trailing slash in config

	async function authedGet(path: string): Promise<Response> {
		const token = await deps.getIdToken();
		return doFetch(`${base}${path}`, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
		});
	}

	return {
		async getGame(gameId: number): Promise<GameDocument> {
			const res = await authedGet(`/games/${gameId}`);
			if (res.status === 404) throw new GameNotFoundError(gameId);
			if (!res.ok) {
				throw new WarehouseError(res.status, `warehouse GET /games/${gameId} failed (${res.status})`);
			}
			return (await res.json()) as GameDocument;
		}
	};
}
