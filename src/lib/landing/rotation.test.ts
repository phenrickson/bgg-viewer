import { describe, it, expect } from 'vitest';
import { dayIndex, pick } from './rotation';

const L3 = ['a', 'b', 'c'] as const;

describe('dayIndex', () => {
	it('is stable across a whole day and advances exactly once at the boundary', () => {
		const day = Date.UTC(2026, 7, 3);
		expect(dayIndex(day)).toBe(dayIndex(day + 86_399_999));
		expect(dayIndex(day + 86_400_000)).toBe(dayIndex(day) + 1);
	});
});

describe('pick', () => {
	it('wraps at list length', () => {
		expect(pick(L3, 0)).toBe('a');
		expect(pick(L3, 3)).toBe('a');
		expect(pick(L3, 4)).toBe('b');
	});

	it('handles negative offsets — JS % keeps the dividend sign, so this would go OOB', () => {
		expect(pick(L3, 0, -1)).toBe('c');
		expect(pick(L3, 0, -4)).toBe('c');
		expect(pick(L3, 1, -5)).toBe('c'); // (1-5) mod 3 = 2
	});

	it('returns null for an empty list rather than undefined', () => {
		expect(pick([], 7)).toBeNull();
	});

	it('pairs two lists of coprime length without repeating before their product', () => {
		// 2 vizzes and 8 games in the fallback; the real set is ~12 and ~30. The pairing is
		// what the user actually sees, and it should outlast either list on its own.
		const vizzes = [0, 1, 2, 3];
		const games = [0, 1, 2, 3, 4];
		const seen = new Set<string>();
		for (let d = 0; d < vizzes.length * games.length; d++) {
			seen.add(`${pick(vizzes, d)}-${pick(games, d)}`);
		}
		expect(seen.size).toBe(vizzes.length * games.length);
	});
});
