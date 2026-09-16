import { describe, it, expect } from 'vitest';
import { coordinatesQuerySql, K_COMPONENTS, PC_COLUMNS } from './columns';
import { WORKING_SET_WHERE } from '../catalog/columns';

describe('coordinatesQuerySql', () => {
	const sql = coordinatesQuerySql('p.analytics.games_features', 'p.predictions.emb', 'p.predictions.coords');

	it('selects exactly K components, from the pre-truncated column', () => {
		expect(K_COMPONENTS).toBe(6);
		expect(PC_COLUMNS).toEqual(['pc_1', 'pc_2', 'pc_3', 'pc_4', 'pc_5', 'pc_6']);
		expect(sql).toContain('embedding_8[OFFSET(0)] AS pc_1');
		expect(sql).toContain('embedding_8[OFFSET(5)] AS pc_6');
		expect(sql).not.toContain('pc_7');
		expect(sql).not.toContain('SELECT *');
		expect(sql).not.toMatch(/e\.embedding\b/);
	});

	it('carries both UMAP axes and the model identity', () => {
		expect(sql).toContain('c.umap_1, c.umap_2');
		expect(sql).toContain('e.embedding_version, e.embedding_model');
	});

	it("shares the catalog query's working-set filter, not a copy of the string", () => {
		expect(sql).toContain(WORKING_SET_WHERE);
	});

	it('joins the two prediction tables on version so a half-landed model bump yields no rows', () => {
		expect(sql).toContain('e.embedding_version = c.embedding_version');
	});

	it('orders deterministically so the artifact hash is stable', () => {
		expect(sql).toContain('ORDER BY f.game_id');
	});
});
