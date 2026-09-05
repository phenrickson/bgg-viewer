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

	it('falls back to the default for an unknown or missing param when it is available', () => {
		expect(resolveSimilarProfile('bogus', all)).toBe(DEFAULT_SIMILAR_PROFILE);
		expect(resolveSimilarProfile(null, all)).toBe(DEFAULT_SIMILAR_PROFILE);
		expect(resolveSimilarProfile(undefined, all)).toBe(DEFAULT_SIMILAR_PROFILE);
	});

	it('drops to `similar` when the default has no list for this game', () => {
		// low-rating game: `recommender` and `sicko` came back empty
		expect(resolveSimilarProfile(null, ['similar'])).toBe('similar');
		expect(resolveSimilarProfile('sicko', ['similar', 'sicko'])).toBe('sicko');
		expect(resolveSimilarProfile('recommender', ['similar', 'sicko'])).toBe('similar');
	});

	it('returns the nominal default when nothing is available — caller handles empty', () => {
		// degenerate (offline / no lists) — resolver never throws
		expect(resolveSimilarProfile('sicko', [])).toBe(DEFAULT_SIMILAR_PROFILE);
	});
});
