import { describe, it, expect } from 'vitest';
import { thumbnailsQuerySql } from './columns';
import { WORKING_SET_WHERE } from '../catalog/columns';

describe('thumbnailsQuerySql', () => {
	const sql = thumbnailsQuerySql('proj.analytics.games_features');

	it('selects game_id, thumbnail and geek_rating — nothing wider', () => {
		expect(sql).toContain('f.game_id');
		expect(sql).toContain('f.thumbnail');
		expect(sql).toContain('f.geek_rating');
		expect(sql).not.toContain('SELECT *');
		expect(sql).not.toContain('description');
		expect(sql).not.toContain('average_weight');
	});

	it('shares the catalog query\'s working-set filter, not a copy of the string', () => {
		expect(sql).toContain(WORKING_SET_WHERE);
	});

	it('orders deterministically so the artifact hash is stable', () => {
		expect(sql).toContain('ORDER BY f.game_id');
	});
});
