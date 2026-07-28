import { describe, it, expect } from 'vitest';
import { catalogQuerySql, ALL_COLUMN_NAMES, SCALAR_NAMES, LIST_COLUMNS } from './columns';

describe('catalogQuerySql', () => {
	const sql = catalogQuerySql('proj.analytics.games_features');

	it('selects every catalog column and nothing wider', () => {
		for (const name of ALL_COLUMN_NAMES) expect(sql).toContain(name);
		expect(sql).not.toContain('SELECT *');
		expect(sql).not.toContain('description'); // heavy field stays out
	});

	it('filters to the working set (rated OR current-year-onward)', () => {
		expect(sql).toContain('users_rated >= 25');
		expect(sql).toContain('year_published >= EXTRACT(YEAR FROM CURRENT_DATE())');
	});

	it('orders deterministically so the artifact hash is stable', () => {
		expect(sql).toContain('ORDER BY game_id');
	});

	it('covers the columns the client filters/charts on', () => {
		expect(SCALAR_NAMES).toContain('geek_rating');
		expect(SCALAR_NAMES).toContain('average_weight');
		expect(LIST_COLUMNS).toContain('categories');
	});
});
