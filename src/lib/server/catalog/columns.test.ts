import { describe, it, expect } from 'vitest';
import {
	catalogQuerySql,
	ALL_COLUMN_NAMES,
	SCALAR_NAMES,
	LIST_COLUMNS,
	INT_LIST_COLUMNS
} from './columns';

describe('catalogQuerySql', () => {
	const sql = catalogQuerySql(
		'proj.analytics.games_features',
		'proj.analytics.best_player_counts',
		'proj.predictions.bgg_predictions'
	);

	it('selects every catalog column and nothing wider', () => {
		for (const name of ALL_COLUMN_NAMES) expect(sql).toContain(name);
		expect(sql).not.toContain('SELECT *');
		expect(sql).not.toContain('description'); // heavy field stays out
		// The features table's own `complexity` stays dropped (duplicate of average_weight).
		// Qualified, because `predicted_complexity` is a different column and belongs here.
		expect(sql).not.toContain('f.complexity');
	});

	it('joins best_player_counts for the player-count arrays', () => {
		expect(sql).toContain('proj.analytics.best_player_counts');
		expect(sql).toContain('SPLIT(bpc.best_player_counts');
		expect(sql).toContain('SPLIT(bpc.recommended_player_counts');
	});

	it('left-joins predictions so unscored games are kept', () => {
		expect(sql).toContain('LEFT JOIN `proj.predictions.bgg_predictions` p USING (game_id)');
		expect(sql).toContain('p.predicted_hurdle_prob');
		expect(sql).toContain('p.predicted_geek_rating');
	});

	it('filters to the working set (rated OR current-year-onward)', () => {
		expect(sql).toContain('users_rated >= 30');
		expect(sql).toContain('year_published >= EXTRACT(YEAR FROM CURRENT_DATE())');
	});

	it('orders deterministically so the artifact hash is stable', () => {
		expect(sql).toContain('ORDER BY game_id');
	});

	it('covers the columns the client filters/charts on', () => {
		expect(SCALAR_NAMES).toContain('geek_rating');
		expect(SCALAR_NAMES).toContain('average_weight');
		expect(LIST_COLUMNS).toContain('categories');
		expect(LIST_COLUMNS).toContain('publishers');
		expect(LIST_COLUMNS).toContain('designers');
		expect(INT_LIST_COLUMNS).toContain('best_player_counts');
	});
});
