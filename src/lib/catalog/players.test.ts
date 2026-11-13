import { describe, expect, it } from 'vitest';
import { boxPlayersLabel, compactCounts } from './players';

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

describe('compactCounts', () => {
	// The game page's "Best at" form: a run of three or more is bridged, shorter runs listed.
	it('bridges runs of three or more and lists the rest', () => {
		expect(compactCounts(['1', '2', '3', '4'])).toBe('1–4');
		expect(compactCounts(['1', '3'])).toBe('1, 3');
		expect(compactCounts(['2', '3'])).toBe('2, 3');
		expect(compactCounts([1, 2, 3, 6])).toBe('1–3, 6');
	});

	it('leaves "+" counts as they are', () => {
		expect(compactCounts(['4', '5', '6+'])).toBe('4, 5, 6+');
	});
});
