import { describe, it, expect } from 'vitest';
import { parseStars, starsName, MAX_STARS } from './stars';

describe('parseStars', () => {
	it('accepts a list of BGG ids, dropping duplicates and keeping order', () => {
		expect(parseStars([13, 7865, 13])).toEqual([13, 7865]);
	});

	it('accepts an empty list (unstarring everything)', () => {
		expect(parseStars([])).toEqual([]);
	});

	it('rejects anything that is not a list of positive integers', () => {
		for (const bad of [null, {}, '13', [1.5], [-1], [0], ['13'], [Number.NaN]]) {
			expect(() => parseStars(bad)).toThrow();
		}
	});

	it('rejects an implausibly long list', () => {
		const many = Array.from({ length: MAX_STARS + 1 }, (_, i) => i + 1);
		expect(() => parseStars(many)).toThrow();
	});
});

describe('starsName', () => {
	it('is one file per user under bggcon/stars/', () => {
		expect(starsName('abc-123')).toBe('bggcon/stars/abc-123.json');
	});

	// The user id ends up in an object path; it must not be able to leave bggcon/stars/.
	it('refuses ids that could change the path', () => {
		for (const bad of ['../x', 'a/b', '', 'a\\b']) expect(() => starsName(bad)).toThrow();
	});
});
