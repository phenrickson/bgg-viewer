import { describe, it, expect } from 'vitest';
import {
	DEFAULT_SCOPE,
	toWhere,
	scopeToParams,
	scopeFromParams,
	universeWhere,
	activeFilters,
	type Scope
} from './scope';

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
			bestAt: 2,
			categories: ['Economic'],
			mechanics: ['Deck Building'],
			designers: ['Uwe Rosenberg', 'Vital Lacerda'],
			q: 'brass'
		};
		const w = toWhere(scope);
		expect(w).toContain('year_published >= 2020');
		expect(w).toContain('list_contains(best_player_counts, 2)');
		// entity filter: OR within the entity
		expect(w).toContain(
			"(list_contains(designers, 'Uwe Rosenberg') OR list_contains(designers, 'Vital Lacerda'))"
		);
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

describe('universeWhere', () => {
	it('keeps the universe and drops every user filter (the strip backdrop)', () => {
		const scoped: Scope = {
			...DEFAULT_SCOPE,
			universe: 'rated',
			yearMin: 2020,
			categories: ['Economic'],
			bestAt: 2
		};
		expect(universeWhere(scoped)).toBe('users_rated >= 30');
		expect(universeWhere(scoped)).not.toContain('year_published');
	});

	it('carries the Top 10,000 universe through', () => {
		expect(universeWhere({ ...DEFAULT_SCOPE, yearMin: 2020 })).toBe(toWhere(DEFAULT_SCOPE));
	});
});

describe('activeFilters', () => {
	it('is empty for a pristine scope — the universe dial is not a filter', () => {
		expect(activeFilters(DEFAULT_SCOPE)).toEqual([]);
		expect(activeFilters({ ...DEFAULT_SCOPE, universe: 'rated' })).toEqual([]);
	});

	it('collapses a two-sided range into one chip and labels open ranges', () => {
		const both = activeFilters({ ...DEFAULT_SCOPE, yearMin: 2015, yearMax: 2020 });
		expect(both).toHaveLength(1);
		expect(both[0].label).toBe('2015–2020');
		expect(activeFilters({ ...DEFAULT_SCOPE, yearMin: 2015 })[0].label).toBe('2015+');
		expect(activeFilters({ ...DEFAULT_SCOPE, yearMax: 2020 })[0].label).toBe('up to 2020');
	});

	it('clears both ends of a range with one chip', () => {
		const [chip] = activeFilters({ ...DEFAULT_SCOPE, ratingMin: 7, ratingMax: 9 });
		expect(chip.patch).toEqual({ ratingMin: null, ratingMax: null });
	});

	it('gives each list value its own chip, removing only that value', () => {
		const chips = activeFilters({ ...DEFAULT_SCOPE, categories: ['Economic', 'Dice'] });
		expect(chips.map((c) => c.label)).toEqual(['Economic', 'Dice']);
		expect(chips[0].patch).toEqual({ categories: ['Dice'] });
	});

	it('labels the entity kinds distinctly so identical names stay legible', () => {
		const chips = activeFilters({
			...DEFAULT_SCOPE,
			designers: ['Reiner Knizia'],
			publishers: ['Reiner Knizia']
		});
		expect(chips.map((c) => c.kind)).toEqual(['designer', 'publisher']);
		expect(new Set(chips.map((c) => c.id)).size).toBe(2); // ids must be unique per row key
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
			ratingMin: 7,
			ratingMax: 9.5,
			geekMin: 6.5,
			players: 3,
			bestAt: 2,
			categories: ['Economic', 'City Building'],
			mechanics: ['Trading'],
			designers: ['Uwe Rosenberg', 'Vital Lacerda'],
			artists: [],
			publishers: ['Hans im Glück, GmbH'], // comma in name — round-trips via repeated params
			families: ['Mechanism: Legacy'],
			universe: 'rated'
		};
		expect(scopeFromParams(scopeToParams(scope))).toEqual(scope);
	});

	it('records the universe only when it is not the Top 10,000 default', () => {
		expect(scopeToParams(DEFAULT_SCOPE).has('u')).toBe(false);
		expect(scopeToParams({ ...DEFAULT_SCOPE, universe: 'rated' }).get('u')).toBe('rated');
	});
});
