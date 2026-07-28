import { describe, it, expect } from 'vitest';
import {
	summarySql,
	ratingHistogramSql,
	gamesPerYearSql,
	scatterSql,
	topFacetSql,
	RATING_BIN,
	SCATTER_LIMIT
} from './aggregates';

const W = 'users_rated >= 25 AND year_published >= 2020';

describe('aggregate SQL builders', () => {
	it('thread the scope WHERE into every query', () => {
		for (const sql of [
			summarySql(W),
			ratingHistogramSql(W),
			gamesPerYearSql(W),
			scatterSql(W),
			topFacetSql(W, 'categories')
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

	it('caps the scatter and sorts by popularity', () => {
		expect(scatterSql(W)).toContain(`LIMIT ${SCATTER_LIMIT}`);
		expect(scatterSql(W)).toContain('ORDER BY users_rated DESC');
		expect(scatterSql(W, 50)).toContain('LIMIT 50');
	});

	it('unnests the facet column inside a subquery before grouping', () => {
		const sql = topFacetSql(W, 'mechanics', 8);
		expect(sql).toMatch(/FROM \(SELECT UNNEST\(mechanics\)/);
		expect(sql).toContain('LIMIT 8');
		// the outer GROUP BY must come after the subquery, not around a bare UNNEST
		expect(sql.indexOf('GROUP BY')).toBeGreaterThan(sql.indexOf('UNNEST'));
	});
});
