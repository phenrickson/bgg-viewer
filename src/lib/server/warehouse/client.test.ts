import { describe, it, expect, vi } from 'vitest';
import { createWarehouseClient } from './client';
import { GameNotFoundError, WarehouseError } from './types';

/** A fetch stub that records its call and returns a canned Response. */
function stubFetch(body: unknown, init: ResponseInit = { status: 200 }) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const fetchImpl = vi.fn(async (url: string | URL | Request, reqInit?: RequestInit) => {
		calls.push({ url: String(url), init: reqInit });
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), init);
	});
	return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const doc = {
	game_id: 13,
	features: { player_counts: [] },
	predictions: null,
	embedding: null,
	similar: [{ game_id: 21, name: 'Carcassonne', year_published: 2000, distance: 0.1 }],
	similar_profiles: {
		similar: [{ game_id: 21, name: 'Carcassonne', year_published: 2000, distance: 0.1 }],
		recommender: [{ game_id: 822, name: 'Carcassonne', year_published: 2000, distance: 0.14 }],
		sicko: []
	},
	provenance: null
};

describe('createWarehouseClient.getGame', () => {
	it('GETs /games/{id} on the configured base and parses the JSON document', async () => {
		const { fetchImpl, calls } = stubFetch(doc);
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		const result = await client.getGame(13);

		expect(calls[0].url).toBe('https://warehouse.example/games/13');
		expect(result).toEqual(doc);
	});

	it('carries the similar_profiles block through untouched', async () => {
		const { fetchImpl } = stubFetch(doc);
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		const result = await client.getGame(13);

		expect(Object.keys(result.similar_profiles ?? {})).toEqual(['similar', 'recommender', 'sicko']);
		expect(result.similar_profiles?.sicko).toEqual([]);
	});

	it('attaches the ID token as a Bearer Authorization header', async () => {
		const { fetchImpl, calls } = stubFetch(doc);
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'signed-id-token',
			fetch: fetchImpl
		});

		await client.getGame(13);

		const headers = calls[0].init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer signed-id-token');
		expect(headers.Accept).toBe('application/json');
	});

	it('tolerates a trailing slash in the configured base URL', async () => {
		const { fetchImpl, calls } = stubFetch(doc);
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example/',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		await client.getGame(13);

		expect(calls[0].url).toBe('https://warehouse.example/games/13');
	});

	it('maps 404 to GameNotFoundError', async () => {
		const { fetchImpl } = stubFetch({ detail: 'game 999 not found' }, { status: 404 });
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		await expect(client.getGame(999)).rejects.toBeInstanceOf(GameNotFoundError);
	});

	it('maps other non-2xx to a typed WarehouseError carrying the status', async () => {
		const { fetchImpl } = stubFetch('nope', { status: 503 });
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		await expect(client.getGame(13)).rejects.toMatchObject({
			name: 'WarehouseError',
			status: 503
		});
		await expect(client.getGame(13)).rejects.toBeInstanceOf(WarehouseError);
	});
});

const newGameRow = {
	game_id: 477235,
	name: 'Das Violette Schwert',
	year_published: 2026,
	thumbnail: null,
	first_seen: '2026-08-18T06:05:04.198Z',
	predicted_hurdle_prob: 0.389
};

describe('createWarehouseClient.getNewGames', () => {
	it('GETs /new-games with the requested day window and parses the row array', async () => {
		const { fetchImpl, calls } = stubFetch([newGameRow]);
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		const result = await client.getNewGames(30);

		expect(calls[0].url).toBe('https://warehouse.example/new-games?days=30');
		expect(result).toEqual([newGameRow]);
	});

	it('maps non-2xx to a typed WarehouseError', async () => {
		const { fetchImpl } = stubFetch('nope', { status: 503 });
		const client = createWarehouseClient({
			baseUrl: 'https://warehouse.example',
			getIdToken: async () => 'tok',
			fetch: fetchImpl
		});

		await expect(client.getNewGames(7)).rejects.toBeInstanceOf(WarehouseError);
	});
});
