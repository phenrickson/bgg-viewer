import { describe, it, expect } from 'vitest';
import { vectorsQuerySql, profilesQuerySql } from './columns';
import { WORKING_SET_WHERE } from '../catalog/columns';

const TABLES = {
	features: 'p.analytics.games_features',
	gss: 'p.analytics.game_similarity_search',
	lines: 'p.analytics.game_product_line',
	profiles: 'p.analytics.similarity_profiles'
};

describe('vectorsQuerySql', () => {
	const sql = vectorsQuerySql(TABLES);

	it('filters to the catalog working set', () => {
		expect(sql).toContain(WORKING_SET_WHERE);
	});

	it('ranks geek rating over the whole table, not the working set', () => {
		const pct = sql.match(/pct AS \(([\s\S]*?)\)\s*,/)?.[1] ?? '';
		expect(pct).toContain('PERCENT_RANK() OVER (ORDER BY geek_rating)');
		expect(pct).toContain('`p.analytics.game_similarity_search`');
		expect(pct).toContain('geek_rating > 0');
		expect(pct).not.toContain(WORKING_SET_WHERE);
	});

	it('takes the ranking columns from game_similarity_search', () => {
		expect(sql).toContain('g.complexity');
		expect(sql).toContain('g.users_rated');
		expect(sql).toContain('g.embedding');
		expect(sql).not.toMatch(/\bf\.complexity\b/);
	});
});

describe('profilesQuerySql', () => {
	it('reads every similarity profile', () => {
		expect(profilesQuerySql(TABLES.profiles)).toMatch(/FROM `p\.analytics\.similarity_profiles`/);
	});
});
