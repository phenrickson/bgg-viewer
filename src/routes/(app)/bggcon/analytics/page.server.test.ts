import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above every other statement, so the mocks it closes over must be too.
const { getBggconActivity, getBggconGames, warehouseClient } = vi.hoisted(() => {
	const getBggconActivity = vi.fn();
	const getBggconGames = vi.fn();
	return {
		getBggconActivity,
		getBggconGames,
		warehouseClient: vi.fn(() => ({ getBggconActivity, getBggconGames }))
	};
});

vi.mock('$lib/server/warehouse', () => ({ warehouseClient }));

const { load } = await import('./+page.server');

const USER = { email: 'someone@example.com' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (user: unknown) => (load as any)({ locals: { user } });

const activity = { as_of: '2026-11-18T16:20:00+00:00', hours: [], buckets: [] };
const games = { as_of: '2026-11-18T16:20:00+00:00', games: [] };

describe('/bggcon/analytics load', () => {
	beforeEach(() => {
		warehouseClient.mockClear();
		getBggconActivity.mockReset().mockResolvedValue(activity);
		getBggconGames.mockReset().mockResolvedValue(games);
	});

	it('401s when signed out, without calling the warehouse', async () => {
		await expect(run(null)).rejects.toMatchObject({ status: 401 });
		expect(getBggconActivity).not.toHaveBeenCalled();
	});

	it('returns both responses', async () => {
		expect(await run(USER)).toEqual({ activity, games, error: null });
	});

	it('turns a warehouse failure into a message', async () => {
		getBggconGames.mockRejectedValue(new Error('warehouse GET /bggcon/games failed (500)'));
		expect(await run(USER)).toEqual({
			activity: null,
			games: null,
			error: 'warehouse GET /bggcon/games failed (500)'
		});
	});

	it('turns a missing WAREHOUSE_API_URL into a message too', async () => {
		warehouseClient.mockImplementationOnce(() => {
			throw new Error('WAREHOUSE_API_URL is not set');
		});
		expect(await run(USER)).toMatchObject({ activity: null, games: null, error: 'WAREHOUSE_API_URL is not set' });
	});
});
