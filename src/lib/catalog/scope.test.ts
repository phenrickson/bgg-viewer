import { describe, it, expect } from 'vitest';
import {
	DEFAULT_SCOPE,
	toWhere,
	scopeToParams,
	scopeFromParams,
	universeWhere,
	activeFilters,
	compactCount,
	niceCount,
	setPlayerCount,
	playerCountModeFor,
	stepYear,
	type Scope
} from './scope';
import {
	CATEGORY_CHIPS,
	COMPLEXITY_BANDS,
	toggleCategory,
	bandPatch,
	discoverScopeFromParams
} from '$lib/discover/dials';

describe('toWhere', () => {
	it('defaults to the All rated universe', () => {
		expect(toWhere(DEFAULT_SCOPE)).toBe('users_rated >= 30');
	});

	it('compiles the Top 10,000 universe to a ranked subquery', () => {
		expect(toWhere({ ...DEFAULT_SCOPE, universe: 'top10k' })).toContain(
			'ORDER BY geek_rating DESC LIMIT 10000'
		);
	});

	describe('the upcoming universe', () => {
		const upcoming: Scope = { ...DEFAULT_SCOPE, universe: 'upcoming', hurdleMin: null };

		it('bounds on the year and requires a scored row', () => {
			const w = toWhere(upcoming);
			expect(w).toContain(`year_published >= ${new Date().getFullYear()}`);
			// The catalog LEFT JOINs predictions, so an unscored upcoming game is a real row
			// with five null model columns — it must be absent, not a blank in every sort.
			expect(w).toContain('predicted_geek_rating IS NOT NULL');
		});

		/**
		 * The heart of sharing one Scope across both rooms: the same filter compiles against
		 * whichever column the universe reads. A game nobody has played has no average_weight,
		 * but it has a predicted one.
		 */
		it('repoints every numeric filter at the predicted columns', () => {
			const w = toWhere({
				...upcoming,
				weightMin: 3,
				weightMax: 3.5,
				ratingMin: 7,
				usersRatedMin: 500,
				geekMin: 6
			});
			expect(w).toContain('predicted_complexity >= 3');
			expect(w).toContain('predicted_complexity <= 3.5');
			expect(w).toContain('predicted_rating >= 7');
			expect(w).toContain('predicted_users_rated >= 500');
			expect(w).toContain('predicted_geek_rating >= 6');
			// …and never the actuals, which are null across most of this population.
			expect(w).not.toContain('average_weight');
			expect(w).not.toContain('average_rating');
			expect(w).not.toMatch(/\busers_rated >=/);
			expect(w).not.toMatch(/(?<!predicted_)geek_rating >=/);
		});

		it('keeps the rated universes on the actual columns', () => {
			const w = toWhere({ ...DEFAULT_SCOPE, universe: 'rated', weightMin: 3, geekMin: 6 });
			expect(w).toContain('average_weight >= 3');
			expect(w).toContain('geek_rating >= 6');
			expect(w).not.toContain('predicted_');
		});

		it('applies the hurdle floor only in the upcoming universe', () => {
			expect(toWhere({ ...upcoming, hurdleMin: 0.5 })).toContain('predicted_hurdle_prob >= 0.5');
			// Elsewhere every game has already cleared it, so the filter would remove nothing
			// while quietly implying it had.
			expect(toWhere({ ...DEFAULT_SCOPE, universe: 'rated', hurdleMin: 0.5 })).not.toContain(
				'predicted_hurdle_prob'
			);
			expect(toWhere({ ...upcoming, hurdleMin: 0 })).not.toContain('predicted_hurdle_prob');
		});
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
			recommendedAt: null,
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

describe('ratings-count helpers', () => {
	it('formats counts compactly above a thousand and exactly below it', () => {
		expect(compactCount(30)).toBe('30');
		expect(compactCount(999)).toBe('999');
		expect(compactCount(1000)).toBe('1k');
		expect(compactCount(1259)).toBe('1.3k');
		expect(compactCount(12500)).toBe('12.5k');
		expect(compactCount(130000)).toBe('130k');
	});

	it('snaps a log-brushed count to a number someone would type', () => {
		expect(niceCount(1259)).toBe(1500);
		expect(niceCount(1100)).toBe(1000);
		expect(niceCount(1800)).toBe(2000);
		expect(niceCount(2600)).toBe(3000);
		expect(niceCount(31)).toBe(30);
		expect(niceCount(96000)).toBe(100000);
	});

	it('is defensive about non-positive input (log10 of 0 is -Infinity)', () => {
		expect(niceCount(0)).toBe(0);
		expect(niceCount(-5)).toBe(0);
		expect(niceCount(NaN)).toBe(0);
	});
});

describe('stepYear', () => {
	const B = { lo: 1900, hi: 2030 };
	const step = (s: Partial<Scope>, d: number, from = 2026) =>
		stepYear({ ...DEFAULT_SCOPE, ...s }, d, B, from);

	it('walks a single year, which is the whole point', () => {
		expect(step({ yearMin: 2019, yearMax: 2019 }, 1)).toEqual({ yearMin: 2020, yearMax: 2020 });
		expect(step({ yearMin: 2019, yearMax: 2019 }, -1)).toEqual({ yearMin: 2018, yearMax: 2018 });
	});

	it('lands on `from` when nothing is set — there is no current year to move', () => {
		expect(step({}, 1)).toEqual({ yearMin: 2026, yearMax: 2026 });
		expect(step({}, -1, 2000)).toEqual({ yearMin: 2000, yearMax: 2000 });
	});

	it('shifts a brushed span and keeps its width', () => {
		expect(step({ yearMin: 2015, yearMax: 2020 }, 1)).toEqual({ yearMin: 2016, yearMax: 2021 });
		expect(step({ yearMin: 2015, yearMax: 2020 }, -5)).toEqual({ yearMin: 2010, yearMax: 2015 });
	});

	it('stops at an edge without squashing the span', () => {
		// The bug worth a test: clamping each bound independently would collapse this to
		// 2030–2030 instead of parking the five-year window against the ceiling.
		expect(step({ yearMin: 2024, yearMax: 2029 }, 10)).toEqual({ yearMin: 2025, yearMax: 2030 });
		expect(step({ yearMin: 1901, yearMax: 1906 }, -10)).toEqual({ yearMin: 1900, yearMax: 1905 });
	});

	it('keeps a half-open range half-open', () => {
		// "1990 onward" walks its floor; it must not silently gain a ceiling.
		expect(step({ yearMin: 1990, yearMax: null }, 1)).toEqual({ yearMin: 1991, yearMax: null });
		expect(step({ yearMin: null, yearMax: 1990 }, 1)).toEqual({ yearMin: null, yearMax: 1991 });
	});

	it('clamps a single year to the bounds', () => {
		expect(step({ yearMin: 2030, yearMax: 2030 }, 1)).toEqual({ yearMin: 2030, yearMax: 2030 });
		expect(step({ yearMin: 1900, yearMax: 1900 }, -1)).toEqual({ yearMin: 1900, yearMax: 1900 });
	});

	it('never inverts the range', () => {
		for (const d of [-50, -1, 1, 50]) {
			for (const [min, max] of [
				[2019, 2019],
				[2015, 2020],
				[1900, 2030]
			] as const) {
				const r = step({ yearMin: min, yearMax: max }, d);
				expect(r.yearMin!).toBeLessThanOrEqual(r.yearMax!);
			}
		}
	});
});

describe('complexity bands', () => {
	const rated = { ...DEFAULT_SCOPE, universe: 'rated' as const };

	it('compiles one band to its half-open interval', () => {
		expect(toWhere({ ...rated, weightBands: [3] })).toContain(
			'(average_weight >= 2.5 AND average_weight < 3)'
		);
	});

	it('leaves the outer bands one-sided', () => {
		// Light has no floor and Heavy no ceiling, so neither needs a second bound or parens.
		expect(toWhere({ ...rated, weightBands: [1] })).toContain('average_weight < 2');
		expect(toWhere({ ...rated, weightBands: [1] })).not.toContain('>= null');
		expect(toWhere({ ...rated, weightBands: [5] })).toContain('average_weight >= 3.5');
		expect(toWhere({ ...rated, weightBands: [5] })).not.toContain('< null');
	});

	it('ORs non-adjacent bands — the whole point of checkboxes', () => {
		// Light or Heavy, nothing in between. A min/max span cannot express this.
		const w = toWhere({ ...rated, weightBands: [1, 5] });
		expect(w).toContain('(average_weight < 2 OR average_weight >= 3.5)');
	});

	it('covers the scale with no gaps and no overlaps at the boundaries', () => {
		// Every band's max is the next band's min, so a boundary value lands in exactly one.
		for (let i = 0; i < COMPLEXITY_BANDS.length - 1; i++) {
			expect(COMPLEXITY_BANDS[i].max).toBe(COMPLEXITY_BANDS[i + 1].min);
		}
		expect(COMPLEXITY_BANDS[0].min).toBeNull();
		expect(COMPLEXITY_BANDS.at(-1)!.max).toBeNull();
	});

	it('adds nothing when no band is checked', () => {
		expect(toWhere({ ...rated, weightBands: [] })).toBe('users_rated >= 30');
	});

	it('ANDs with the strip’s free range rather than replacing it', () => {
		// Both controls stay live; bands did not take weightMin/weightMax away.
		const w = toWhere({ ...rated, weightBands: [5], weightMin: 4 });
		expect(w).toContain('average_weight >= 4');
		expect(w).toContain('average_weight >= 3.5');
	});

	it('reads the predicted column in the upcoming universe', () => {
		expect(toWhere({ ...DEFAULT_SCOPE, universe: 'upcoming', weightBands: [3] })).toContain(
			'(predicted_complexity >= 2.5 AND predicted_complexity < 3)'
		);
	});

	it('ignores indices that name no band', () => {
		expect(toWhere({ ...rated, weightBands: [0, 9, 99] })).toBe('users_rated >= 30');
	});

	it('gives each band its own removable chip', () => {
		const chips = activeFilters({ ...DEFAULT_SCOPE, weightBands: [1, 5] });
		expect(chips.map((c) => c.label)).toEqual(['Light', 'Heavy']);
		expect(chips.every((c) => c.kind === 'complexity')).toBe(true);
		// Clearing one leaves the other.
		expect(chips[0].patch).toEqual({ weightBands: [5] });
	});

	it('round-trips through the URL as sorted indices', () => {
		const p = scopeToParams({ ...DEFAULT_SCOPE, weightBands: [5, 1] });
		expect(p.get('wband')).toBe('1,5');
		expect(scopeFromParams(p).weightBands).toEqual([1, 5]);
	});

	it('sets no param when nothing is checked', () => {
		expect(scopeToParams(DEFAULT_SCOPE).has('wband')).toBe(false);
	});

	it('sanitizes a hand-written wband — junk, dupes and out-of-range', () => {
		const s = scopeFromParams(new URLSearchParams('wband=9,foo,2,2,,3.5,-1,1'));
		expect(s.weightBands).toEqual([1, 2]);
	});
});

describe('the player-count row', () => {
	describe('setPlayerCount', () => {
		it('sets the mode’s field and clears the other', () => {
			expect(setPlayerCount({ ...DEFAULT_SCOPE, bestAt: 4 }, 'players', 2)).toEqual({
				players: 2,
				bestAt: null,
				recommendedAt: null
			});
			expect(setPlayerCount({ ...DEFAULT_SCOPE, players: 2 }, 'bestAt', 4)).toEqual({
				players: null,
				bestAt: 4,
				recommendedAt: null
			});
		});

		it('clears the count when the lit number is re-picked', () => {
			expect(setPlayerCount({ ...DEFAULT_SCOPE, players: 2 }, 'players', 2)).toEqual({
				players: null,
				bestAt: null,
				recommendedAt: null
			});
			expect(setPlayerCount({ ...DEFAULT_SCOPE, bestAt: 4 }, 'bestAt', 4)).toEqual({
				players: null,
				bestAt: null,
				recommendedAt: null
			});
		});

		it('re-picking one mode’s number does not resurrect the other', () => {
			// The count clears, but bestAt must stay cleared rather than coming back.
			expect(setPlayerCount({ ...DEFAULT_SCOPE, players: 2, bestAt: 4 }, 'players', 2)).toEqual({
				players: null,
				bestAt: null,
				recommendedAt: null
			});
		});

		it('carries a null through, so switching mode with nothing set stays empty', () => {
			expect(setPlayerCount(DEFAULT_SCOPE, 'bestAt', null)).toEqual({
				players: null,
				bestAt: null,
				recommendedAt: null
			});
		});

		it('sets recommendedAt and clears the other two', () => {
			expect(
				setPlayerCount({ ...DEFAULT_SCOPE, players: 2, bestAt: 4 }, 'recommendedAt', 5)
			).toEqual({
				players: null,
				bestAt: null,
				recommendedAt: 5
			});
		});

		it('never yields a scope where both fields are set', () => {
			const both: Scope = { ...DEFAULT_SCOPE, players: 3, bestAt: 5 };
			for (const mode of ['players', 'bestAt'] as const) {
				for (const n of [1, 3, 5, 6, null]) {
					const patch = setPlayerCount(both, mode, n);
					expect(patch.players === null || patch.bestAt === null).toBe(true);
				}
			}
		});
	});

	describe('playerCountModeFor', () => {
		it('reads Plays-with when nothing is set', () => {
			expect(playerCountModeFor(DEFAULT_SCOPE)).toBe('players');
		});

		it('follows whichever field is set, so a shared ?best= link lands on Best-at', () => {
			expect(playerCountModeFor(scopeFromParams(new URLSearchParams('best=4')))).toBe('bestAt');
			expect(playerCountModeFor(scopeFromParams(new URLSearchParams('p=2')))).toBe('players');
		});

		it('prefers Best-at when a hand-written URL sets both', () => {
			expect(playerCountModeFor({ ...DEFAULT_SCOPE, players: 2, bestAt: 4 })).toBe('bestAt');
		});
	});

	it('still compiles both fields — the constraint is the UI, not the data layer', () => {
		// A hand-written ?p=2&best=4 stays meaningful; only the rail refuses to author it.
		const w = toWhere({ ...DEFAULT_SCOPE, universe: 'rated', players: 2, bestAt: 4 });
		expect(w).toContain('min_players <= 2 AND max_players >= 2');
		expect(w).toContain('list_contains(best_player_counts, 4)');
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

	it('labels a ratings-count window compactly', () => {
		expect(activeFilters({ ...DEFAULT_SCOPE, usersRatedMin: 1000 })[0]).toMatchObject({
			kind: 'ratings',
			label: '1k+'
		});
		const [both] = activeFilters({ ...DEFAULT_SCOPE, usersRatedMin: 500, usersRatedMax: 20000 });
		expect(both.label).toBe('500–20k');
		expect(both.patch).toEqual({ usersRatedMin: null, usersRatedMax: null });
	});

	it('labels a brushed bound exactly, not rounded to one decimal', () => {
		// The strip brushes in 0.25 steps; "3.3–4.8" would contradict the applied filter.
		const [chip] = activeFilters({ ...DEFAULT_SCOPE, weightMin: 3.25, weightMax: 4.75 });
		expect(chip.label).toBe('3.25–4.75');
		expect(activeFilters({ ...DEFAULT_SCOPE, weightMin: 3 })[0].label).toBe('3+');
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
			weightBands: [2, 4],
			ratingMin: 7,
			ratingMax: 9.5,
			usersRatedMin: 1000,
			usersRatedMax: 50000,
			geekMin: 6.5,
			geekMax: 8,
			players: 3,
			bestAt: 2,
			recommendedAt: 5,
			categories: ['Economic', 'City Building'],
			mechanics: ['Trading'],
			designers: ['Uwe Rosenberg', 'Vital Lacerda'],
			artists: [],
			publishers: ['Hans im Glück, GmbH'], // comma in name — round-trips via repeated params
			families: ['Mechanism: Legacy'],
			universe: 'rated',
			hurdleMin: null
		};
		expect(scopeFromParams(scopeToParams(scope))).toEqual(scope);
	});

	it('records the universe only when it is not the All rated default', () => {
		expect(scopeToParams(DEFAULT_SCOPE).has('u')).toBe(false);
		expect(scopeToParams({ ...DEFAULT_SCOPE, universe: 'top10k' }).get('u')).toBe('top10k');
		expect(scopeToParams({ ...DEFAULT_SCOPE, universe: 'upcoming' }).get('u')).toBe('upcoming');
	});

	// The hurdle floor defaults to 0.25 in `upcoming` and null everywhere else, so a bare
	// `?u=upcoming` must parse back WITH the floor — and an explicitly cleared floor (0) has
	// to survive the round trip rather than being mistaken for "unset, use the default".
	it('round-trips the upcoming universe and its hurdle floor', () => {
		const upcoming: Scope = { ...DEFAULT_SCOPE, universe: 'upcoming', hurdleMin: 0.25 };
		expect(scopeToParams(upcoming).has('h')).toBe(false); // the default is not serialized
		expect(scopeFromParams(scopeToParams(upcoming))).toEqual(upcoming);

		const cleared: Scope = { ...upcoming, hurdleMin: 0 };
		expect(scopeToParams(cleared).get('h')).toBe('0');
		expect(scopeFromParams(scopeToParams(cleared)).hurdleMin).toBe(0);

		const raised: Scope = { ...upcoming, hurdleMin: 0.8 };
		expect(scopeFromParams(scopeToParams(raised)).hurdleMin).toBe(0.8);
	});
});

describe('discoverScopeFromParams', () => {
	// A plain alias now — `scopeFromParams`'s own default (`DEFAULT_SCOPE.universe`) is
	// `rated`, same as Discover's "top rated, all-time" promise, so there's no override left
	// to make here. Kept as its own function for Discover's call site regardless.
	it('defaults to rated when the URL has no universe param', () => {
		const params = new URLSearchParams('');
		expect(discoverScopeFromParams(params).universe).toBe('rated');
	});

	it('honours an explicit ?u=rated', () => {
		const params = new URLSearchParams('u=rated');
		expect(discoverScopeFromParams(params).universe).toBe('rated');
	});

	it('honours an explicit ?u=top10k', () => {
		const params = new URLSearchParams('u=top10k');
		expect(discoverScopeFromParams(params).universe).toBe('top10k');
	});
});

describe('a Discover-shaped scope', () => {
	it('survives a params round-trip', () => {
		const war = CATEGORY_CHIPS.find((c) => c.label === 'Wargame')!;
		const coop = CATEGORY_CHIPS.find((c) => c.label === 'Cooperative')!;
		const heavy = COMPLEXITY_BANDS[4];

		let s: Scope = { ...DEFAULT_SCOPE };
		s = { ...s, ...toggleCategory(s, war) };
		s = { ...s, ...toggleCategory(s, coop) };
		s = { ...s, ...bandPatch(s, heavy) };
		s = { ...s, bestAt: 2 };

		const back = scopeFromParams(scopeToParams(s));
		expect(back.categories).toEqual(['Wargame']);
		expect(back.mechanics).toEqual(['Cooperative Game']);
		expect(back.weightMin).toBe(3.5);
		expect(back.weightMax).toBeNull();
		expect(back.bestAt).toBe(2);
	});

	it('expresses a geek-rating band, and clears both bounds as one chip', () => {
		// "Hidden gems" is a rank band — outside the top 1,000 but still well regarded — and
		// `geek_rating` has no rank column, so the band is stated as its two cutoffs. Before
		// `geekMax` existed this was inexpressible: only a floor could be set.
		const band: Scope = { ...DEFAULT_SCOPE, geekMin: 6.278, geekMax: 6.671 };

		const where = toWhere(band);
		expect(where).toContain('geek_rating >= 6.278');
		expect(where).toContain('geek_rating <= 6.671');

		const back = scopeFromParams(scopeToParams(band));
		expect(back.geekMin).toBe(6.278);
		expect(back.geekMax).toBe(6.671);

		// One chip for the pair, and dismissing it must remove BOTH — a leftover max would
		// keep filtering with nothing on screen able to clear it.
		const chip = activeFilters(band).find((f) => f.id === 'geek');
		expect(chip).toBeDefined();
		const cleared = { ...band, ...chip!.patch };
		expect(cleared.geekMin).toBeNull();
		expect(cleared.geekMax).toBeNull();
	});

	it('compiles best-at to a list_contains predicate', () => {
		const where = toWhere({ ...DEFAULT_SCOPE, bestAt: 3 });
		expect(where).toContain('list_contains(best_player_counts, 3)');
	});
});
