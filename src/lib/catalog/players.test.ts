import { describe, expect, it } from 'vitest';
import { boxPlayersLabel } from './players';

describe('boxPlayersLabel', () => {
	it('reads a range, a single count, or nothing', () => {
		expect(boxPlayersLabel(1, 4)).toBe('1–4 players');
		expect(boxPlayersLabel(2, 2)).toBe('2 players');
		expect(boxPlayersLabel(1, 1)).toBe('1 player');
		expect(boxPlayersLabel(null, 5)).toBe('5 players');
		expect(boxPlayersLabel(0, null)).toBeNull();
	});

	it('has a short form, for beside a players icon', () => {
		expect(boxPlayersLabel(1, 4, true)).toBe('1–4');
		expect(boxPlayersLabel(1, 1, true)).toBe('1');
	});
});
