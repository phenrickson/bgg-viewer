import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchOwnedCollection = vi.fn();
vi.mock('./read', () => ({ fetchOwnedCollection: (username: string) => fetchOwnedCollection(username) }));

const getGatedServiceIdToken = vi.fn(async (_audience: string, _override?: string) => 'test-token');
vi.mock('$lib/server/warehouse/token', () => ({
	getGatedServiceIdToken: (audience: string, override?: string) =>
		getGatedServiceIdToken(audience, override)
}));

vi.mock('$env/dynamic/private', () => ({
	env: { COLLECTION_SYNC_SERVICE_URL: 'https://collections.example' }
}));

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
vi.stubGlobal('fetch', fetchMock);

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
	fetchOwnedCollection.mockReset();
	getGatedServiceIdToken.mockClear();
	fetchMock.mockClear();
	consoleError.mockClear();
});

const { triggerSync } = await import('./sync');

describe('triggerSync', () => {
	it('skips the sync call when the collection is already fresh', async () => {
		fetchOwnedCollection.mockResolvedValue({
			game_ids: [1, 2, 3],
			updated_at: new Date().toISOString()
		});

		await triggerSync('phenrickson');

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('syncs when the collection is missing', async () => {
		fetchOwnedCollection.mockResolvedValue({ game_ids: [], updated_at: null });

		await triggerSync('newuser');

		expect(fetchMock).toHaveBeenCalledWith(
			'https://collections.example/sync/newuser',
			expect.objectContaining({
				method: 'POST',
				headers: { Authorization: 'Bearer test-token' }
			})
		);
	});

	it('syncs when the collection is stale', async () => {
		const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		fetchOwnedCollection.mockResolvedValue({ game_ids: [1], updated_at: staleDate });

		await triggerSync('phenrickson');

		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('never throws — logs and swallows a failed sync call', async () => {
		fetchOwnedCollection.mockResolvedValue({ game_ids: [], updated_at: null });
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }));

		await expect(triggerSync('ghost')).resolves.toBeUndefined();
		expect(consoleError).toHaveBeenCalled();
	});

	it('never throws — logs and swallows a thrown error', async () => {
		fetchOwnedCollection.mockRejectedValue(new Error('BigQuery unavailable'));

		await expect(triggerSync('phenrickson')).resolves.toBeUndefined();
		expect(consoleError).toHaveBeenCalled();
	});
});
