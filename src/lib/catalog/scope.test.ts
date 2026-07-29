import { describe, it, expect } from 'vitest';
import { DEFAULT_SCOPE, toWhere, scopeToParams, scopeFromParams, type Scope } from './scope';

describe('toWhere', () => {
	it('defaults to the Top 10,000 universe', () => {
		expect(toWhere(DEFAULT_SCOPE)).toContain('ORDER BY geek_rating DESC LIMIT 10000');
	});

	it('compiles the All rated universe to a users_rated floor', () => {
		expect(toWhere({ ...DEFAULT_SCOPE, universe: 'rated' })).toBe('users_rated >= 30');
	});

	it('compiles ranges, players, facets, and search into a conjunction', () => {
		const scope: Scope = {
			...DEFAULT_SCOPE,
			universe: 'rated',
			yearMin: 2020,
			yearMax: 2025,
			weightMin: 3,
			geekMin: 7,
			players: 4,
			categories: ['Economic'],
			mechanics: ['Deck Building'],
			q: 'brass'
		};
		const w = toWhere(scope);
		expect(w).toContain('year_published >= 2020');
		expect(w).toContain('year_published <= 2025');
		expect(w).toContain('average_weight >= 3');
		expect(w).toContain('geek_rating >= 7');
		expect(w).toContain('min_players <= 4 AND max_players >= 4');
		expect(w).toContain("list_contains(categories, 'Economic')");
		expect(w).toContain("list_contains(mechanics, 'Deck Building')");
		expect(w).toContain("lower(name) LIKE '%brass%'");
	});

	it('escapes quotes in facets and search (injection-safe)', () => {
		const w = toWhere({ ...DEFAULT_SCOPE, categories: ["a' OR '1'='1"], q: "x'; DROP TABLE" });
		expect(w).toContain("list_contains(categories, 'a'' OR ''1''=''1')");
		expect(w).not.toMatch(/DROP TABLE catalog/); // the payload is a quoted literal, not SQL
	});

	it('ignores a too-short search term', () => {
		expect(toWhere({ ...DEFAULT_SCOPE, universe: 'rated', q: 'a' })).toBe('users_rated >= 30');
	});
});

describe('URL round-trip', () => {
	it('serializes only non-default values', () => {
		const p = scopeToParams(DEFAULT_SCOPE);
		expect(p.toString()).toBe(''); // pristine default → empty URL
	});

	it('round-trips a populated scope', () => {
		const scope: Scope = {
			q: 'catan',
			yearMin: 2010,
			yearMax: null,
			weightMin: 2,
			weightMax: 4,
			geekMin: 6.5,
			players: 3,
			categories: ['Economic', 'City Building'],
			mechanics: ['Trading'],
			universe: 'rated'
		};
		expect(scopeFromParams(scopeToParams(scope))).toEqual(scope);
	});

	it('records the universe only when it is not the Top 10,000 default', () => {
		expect(scopeToParams(DEFAULT_SCOPE).has('u')).toBe(false);
		expect(scopeToParams({ ...DEFAULT_SCOPE, universe: 'rated' }).get('u')).toBe('rated');
	});
});
