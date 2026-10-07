import { describe, it, expect } from 'vitest';
import { parseIdPool, MAX_POOL_IDS } from './id-pool';

describe('parseIdPool', () => {
	it('takes a seed id and a list of game ids', () => {
		expect(parseIdPool({ id: 13, ids: [1, 2, 3] })).toEqual({ ok: true, id: 13, ids: [1, 2, 3] });
	});

	it('drops repeats, so the pool is a set', () => {
		expect(parseIdPool({ id: 13, ids: [2, 2, 1] })).toEqual({ ok: true, id: 13, ids: [2, 1] });
	});

	it('refuses a missing or bad seed', () => {
		expect(parseIdPool({ ids: [1] }).ok).toBe(false);
		expect(parseIdPool({ id: -1, ids: [1] }).ok).toBe(false);
		expect(parseIdPool({ id: 1.5, ids: [1] }).ok).toBe(false);
	});

	it('refuses an empty, non-integer or oversized pool', () => {
		expect(parseIdPool({ id: 13, ids: [] }).ok).toBe(false);
		expect(parseIdPool({ id: 13, ids: [1, 'x'] }).ok).toBe(false);
		expect(parseIdPool({ id: 13, ids: 'nope' }).ok).toBe(false);
		const big = Array.from({ length: MAX_POOL_IDS + 1 }, (_, i) => i + 1);
		expect(parseIdPool({ id: 13, ids: big }).ok).toBe(false);
	});

	it('refuses a body that is not an object', () => {
		expect(parseIdPool(null).ok).toBe(false);
		expect(parseIdPool('x').ok).toBe(false);
	});
});
