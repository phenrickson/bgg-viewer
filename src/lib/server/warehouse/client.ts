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
import {
	GameNotFoundError,
	WarehouseError,
	type GameDocument,
	type Lineage,
	type NewGameRow,
	type PipelineStatus,
	type TableSchema
} from './types';

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
	getNewGames(days: 7 | 30 | 365): Promise<NewGameRow[]>;
	getPipelineStatus(days?: number): Promise<PipelineStatus>;
	getLineage(): Promise<Lineage>;
	getTableSchema(id: string): Promise<TableSchema>;
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

	/** A WarehouseError carrying the API's `detail` (missing token, no access, …), shown on admin pages. */
	async function failure(res: Response, path: string): Promise<WarehouseError> {
		const detail = await res
			.json()
			.then((b: { detail?: string }) => b.detail ?? '')
			.catch(() => '');
		return new WarehouseError(
			res.status,
			`warehouse GET ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`
		);
	}

	return {
		async getGame(gameId: number): Promise<GameDocument> {
			const res = await authedGet(`/games/${gameId}`);
			if (res.status === 404) throw new GameNotFoundError(gameId);
			if (!res.ok) {
				throw new WarehouseError(res.status, `warehouse GET /games/${gameId} failed (${res.status})`);
			}
			return (await res.json()) as GameDocument;
		},

		async getNewGames(days: 7 | 30 | 365): Promise<NewGameRow[]> {
			const res = await authedGet(`/new-games?days=${days}`);
			if (!res.ok) {
				throw new WarehouseError(res.status, `warehouse GET /new-games failed (${res.status})`);
			}
			return (await res.json()) as NewGameRow[];
		},

		async getPipelineStatus(days = 14): Promise<PipelineStatus> {
			const res = await authedGet(`/monitoring/pipeline?days=${days}`);
			if (!res.ok) throw await failure(res, '/monitoring/pipeline');
			return (await res.json()) as PipelineStatus;
		},

		async getLineage(): Promise<Lineage> {
			const res = await authedGet('/monitoring/lineage');
			if (!res.ok) throw await failure(res, '/monitoring/lineage');
			return (await res.json()) as Lineage;
		},

		async getTableSchema(id: string): Promise<TableSchema> {
			const path = `/monitoring/tables/${encodeURIComponent(id)}`;
			const res = await authedGet(path);
			if (!res.ok) throw await failure(res, path);
			return (await res.json()) as TableSchema;
		}
	};
}
