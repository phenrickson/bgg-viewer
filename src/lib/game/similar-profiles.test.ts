import { describe, it, expect } from 'vitest';
import {
	SIMILAR_PROFILES,
	DEFAULT_SIMILAR_PROFILE,
	isSimilarProfile,
	resolveSimilarProfile
} from './similar-profiles';

describe('isSimilarProfile', () => {
	it('accepts the three known names', () => {
		for (const p of SIMILAR_PROFILES) expect(isSimilarProfile(p)).toBe(true);
	});

	it('rejects anything else', () => {
		for (const x of ['', 'SIMILAR', 'default', 'bogus', null, undefined, 3, {}])
			expect(isSimilarProfile(x)).toBe(false);
	});
});

describe('resolveSimilarProfile', () => {
	const all = [...SIMILAR_PROFILES];

	it('passes a known, available profile through', () => {
		expect(resolveSimilarProfile('sicko', all)).toBe('sicko');
		expect(resolveSimilarProfile('recommender', all)).toBe('recommender');
	});

	it('falls back to the default for an unknown or missing param', () => {
		expect(resolveSimilarProfile('bogus', all)).toBe(DEFAULT_SIMILAR_PROFILE);
		expect(resolveSimilarProfile(null, all)).toBe(DEFAULT_SIMILAR_PROFILE);
		expect(resolveSimilarProfile(undefined, all)).toBe(DEFAULT_SIMILAR_PROFILE);
	});

	it('falls back when the requested profile is empty for this game', () => {
		// low-rating game: only `similar` has a list
		expect(resolveSimilarProfile('sicko', ['similar'])).toBe(DEFAULT_SIMILAR_PROFILE);
	});

	it('still falls back to the default even when the default itself is unavailable', () => {
		// degenerate (offline / no lists) — resolver never throws, caller handles empty
		expect(resolveSimilarProfile('sicko', [])).toBe(DEFAULT_SIMILAR_PROFILE);
	});
});
