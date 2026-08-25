import { describe, it, expect } from 'vitest';
import { COMPLEXITY_BANDS } from './scope';
import {
	summarySql,
	ratingHistogramSql,
	gamesPerYearSql,
	scatterSql,
	popularitySql,
	popularityRatingGeekSql,
	scatterSelectionSql,
	popularitySelectionSql,
	facetSearchSql,
	complexityBandsSql,
	RATING_BIN,
	SCATTER_LIMIT,
	YEAR_FLOOR,
	YEAR_DISPLAY_FLOOR,
	measures
} from './aggregates';

const W = 'users_rated >= 25 AND year_published >= 2020';

describe('aggregate SQL builders', () => {
	it('thread the scope WHERE into every query', () => {
		for (const sql of [
			summarySql(W),
			ratingHistogramSql(W),
			gamesPerYearSql(W),
			scatterSql(W),
			popularitySql(W),
			facetSearchSql(W, 'categories')
		]) {
			expect(sql).toContain(W);
			expect(sql).toContain('FROM catalog');
		}
	});

	it('buckets ratings by RATING_BIN and orders ascending', () => {
		const sql = ratingHistogramSql(W);
		expect(sql).toContain(`/ ${RATING_BIN}`);
		expect(sql).toContain('average_rating > 0');
		expect(sql).toContain('ORDER BY bucket');
	});

	it('returns every game in scope (Canvas renders the full cloud), not a sample', () => {
		const sql = scatterSql(W);
		expect(sql).toContain('average_weight AS x');
		expect(sql).toContain('average_rating AS y');
		expect(sql).not.toContain('SAMPLE'); // no sampling — full set on Canvas
		expect(sql).toContain(`LIMIT ${SCATTER_LIMIT}`); // defensive cap only
		expect(scatterSql(W, 50)).toContain('LIMIT 50');
	});

	it('carries geek rating as a third column for the popularity plot', () => {
		// The colour dimension is the point of this query: it is what shows a sparsely-rated
		// 9.0 being pulled back toward the middle, which neither axis alone can say.
		const sql = popularityRatingGeekSql(W);
		// Rating on x, popularity on y — the vertical axis is the log one.
		expect(sql).toContain('average_rating AS x');
		expect(sql).toContain('users_rated AS y');
		expect(sql).toContain('geek_rating AS c');
		// Every axis excludes its own zeros — a zero here means "not measured", not a value.
		expect(sql).toContain('users_rated > 0');
		expect(sql).toContain('average_rating > 0');
		expect(sql).toContain('geek_rating > 0');
		expect(sql).toContain(W);
		expect(sql).toContain('FROM catalog');
	});

	it('never lets a NULL-column filter read as "selected" — a null year under a year filter is NOT in scope', () => {
		// `selectedWhere` is a boolean SQL expression evaluated against the WIDER `baseWhere`
		// population, which can include rows the expression's own columns are null for (e.g. a
		// year filter against a game with no recorded `year_published`, like Tic-Tac-Toe or
		// Chutes and Ladders). SQL's three-valued logic makes `year_published >= 2025` evaluate
		// to NULL there, not FALSE — and an un-coalesced `NULL AS selected` reads in JS as
		// "not === false", i.e. wrongly treated as selected/in-filter by every strict
		// `selected === false` / `selected !== false` check in Scatter.svelte. COALESCE to
		// FALSE pins the three-valued result down to a real boolean before it ever reaches JS.
		const selectedWhere = 'year_published >= 2025';
		for (const sql of [
			scatterSelectionSql(W, selectedWhere),
			popularitySelectionSql(W, selectedWhere)
		]) {
			expect(sql).toContain(`COALESCE((${selectedWhere}), FALSE) AS selected`);
			expect(sql).toContain(`WHERE ${W}`); // still scoped to the wider backdrop population
		}
	});

	it('marshals numbers only — game_id, never the name string (lazy names)', () => {
		// The name is resolved via the catalog id→name map; re-pulling it per filter is the
		// string-decode cost that made scope changes slow.
		for (const sql of [scatterSql(W), popularitySql(W)]) {
			expect(sql).toContain('game_id');
			expect(sql).not.toContain('name');
		}
	});

	it('plots rating against users_rated for the popularity scatter', () => {
		const sql = popularitySql(W);
		expect(sql).toContain('average_rating AS x');
		expect(sql).toContain('users_rated AS y');
		expect(sql).toContain('users_rated > 0'); // required for a log y-scale
		expect(sql).not.toContain('SAMPLE');
	});

	it('floors the year chart at the display floor when asked, not the data floor', () => {
		expect(gamesPerYearSql(W)).toContain(`year_published >= ${YEAR_FLOOR}`);
		expect(gamesPerYearSql(W, YEAR_DISPLAY_FLOOR)).toContain(
			`year_published >= ${YEAR_DISPLAY_FLOOR}`
		);
	});

	it('counts facets within scope and narrows them by an escaped term', () => {
		const plain = facetSearchSql(W, 'categories');
		expect(plain).toContain(W);
		expect(plain).not.toContain('ILIKE');
		const searched = facetSearchSql(W, 'categories', "war' OR 1=1", 5);
		expect(searched).toContain("ILIKE '%war'' OR 1=1%'"); // quote doubled — a literal, not SQL
		expect(searched).toContain('LIMIT 5');
		// the term filters the unnested values, so it must sit outside the subquery
		expect(searched.indexOf('ILIKE')).toBeGreaterThan(searched.indexOf('UNNEST'));
	});

	it('unnests the facet column inside a subquery before grouping', () => {
		const sql = facetSearchSql(W, 'mechanics', '', 8);
		expect(sql).toMatch(/FROM \(SELECT UNNEST\(mechanics\)/);
		expect(sql).toContain('LIMIT 8');
		// the outer GROUP BY must come after the subquery, not around a bare UNNEST
		expect(sql.indexOf('GROUP BY')).toBeGreaterThan(sql.indexOf('UNNEST'));
	});
});

describe('complexityBandsSql', () => {
	it('reads the same cut points the weightBands WHERE clause uses', () => {
		const sql = complexityBandsSql(W);
		// Half-open, matching toWhere: a game at exactly 2.5 is Medium, never Medium-Light.
		expect(sql).toContain('average_weight < 2');
		expect(sql).toContain('average_weight >= 2 AND average_weight < 2.5');
		expect(sql).toContain('average_weight >= 3.5');
		expect(sql).toContain(W);
	});

	it('emits one arm per named band, numbered to match scope.weightBands', () => {
		const sql = complexityBandsSql(W);
		for (const [i, b] of COMPLEXITY_BANDS.entries()) {
			expect(sql).toContain(`THEN ${i + 1}`);
			expect(sql).toContain(b.label);
		}
	});

	it('reads the model estimate in the upcoming universe', () => {
		expect(complexityBandsSql(W, measures('upcoming'))).toContain('predicted_complexity');
	});
});

