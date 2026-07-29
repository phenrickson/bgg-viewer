import { describe, it, expect } from 'vitest';
import {
	summarySql,
	ratingHistogramSql,
	gamesPerYearSql,
	scatterSql,
	popularitySql,
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
			popularitySql(W),
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

	it('takes a seeded representative sample, not the top-N by popularity', () => {
		const sql = scatterSql(W);
		expect(sql).toMatch(/USING SAMPLE 2000 ROWS \(reservoir, \d+\)/);
		expect(sql).not.toContain('ORDER BY users_rated DESC'); // sampled, not ranked
		expect(scatterSql(W, 50)).toContain('SAMPLE 50 ROWS');
	});

	it('plots rating against users_rated for the popularity scatter', () => {
		const sql = popularitySql(W);
		expect(sql).toContain('average_rating AS x');
		expect(sql).toContain('users_rated AS y');
		expect(sql).toContain('users_rated > 0'); // required for a log y-scale
		expect(sql).toContain(`SAMPLE ${SCATTER_LIMIT} ROWS`);
	});

	it('unnests the facet column inside a subquery before grouping', () => {
		const sql = topFacetSql(W, 'mechanics', 8);
		expect(sql).toMatch(/FROM \(SELECT UNNEST\(mechanics\)/);
		expect(sql).toContain('LIMIT 8');
		// the outer GROUP BY must come after the subquery, not around a bare UNNEST
		expect(sql.indexOf('GROUP BY')).toBeGreaterThan(sql.indexOf('UNNEST'));
	});
});
