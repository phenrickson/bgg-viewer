import { describe, expect, it, vi } from 'vitest';
import { fetchOwnedCollection } from './read';
import type { BigQuery } from '@google-cloud/bigquery';

function fakeClient(rows: unknown[]) {
	return { query: vi.fn().mockResolvedValue([rows]) } as unknown as BigQuery;
}

describe('fetchOwnedCollection', () => {
	it('queries owned=TRUE for the given username', async () => {
		const client = fakeClient([]);
		await fetchOwnedCollection('phil', client);
		const [{ query, params }] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(query).toContain('WHERE username = @username AND owned = TRUE');
		expect(params).toEqual({ username: 'phil' });
	});

	it('returns game ids and the latest updated_at', async () => {
		const client = fakeClient([
			{ game_id: 13, updated_at: { value: '2026-08-20T00:00:00Z' } },
			{ game_id: 68448, updated_at: { value: '2026-08-25T00:00:00Z' } }
		]);
		const result = await fetchOwnedCollection('phil', client);
		expect(result.game_ids).toEqual([13, 68448]);
		expect(result.updated_at).toBe('2026-08-25T00:00:00Z');
	});

	it('returns an empty result with null updated_at for an unknown username', async () => {
		const result = await fetchOwnedCollection('nobody', fakeClient([]));
		expect(result).toEqual({ game_ids: [], updated_at: null });
	});
});
