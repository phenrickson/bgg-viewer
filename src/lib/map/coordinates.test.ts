import { describe, it, expect } from 'vitest';
import { parseCoordinates } from './coordinates';
import { rowsToArrowIPC, type CoordinateRow } from '$lib/server/coordinates/serialize';

function row(game_id: number, pc1: number): CoordinateRow {
	return {
		game_id,
		pc_1: pc1,
		pc_2: 2,
		pc_3: 3,
		pc_4: 4,
		pc_5: 5,
		pc_6: 6,
		umap_1: 10,
		umap_2: 20,
		embedding_version: 6,
		embedding_model: 'embeddings-v2026'
	} as CoordinateRow;
}

describe('parseCoordinates', () => {
	it('reads the artifact into typed columns with an id index and the model identity', () => {
		const set = parseCoordinates(rowsToArrowIPC([row(13, 0.5), row(188, -1.5)]));
		expect(set.k).toBe(6);
		expect(set.pcs).toHaveLength(6);
		expect(Array.from(set.ids)).toEqual([13, 188]);
		expect(set.pcs[0]).toBeInstanceOf(Float32Array);
		expect(set.pcs[0][1]).toBeCloseTo(-1.5);
		expect(set.pcs[5][0]).toBeCloseTo(6);
		expect(set.umap[1][0]).toBeCloseTo(20);
		expect(set.index.get(188)).toBe(1);
		expect(set.model).toBe('embeddings-v2026');
		expect(set.version).toBe(6);
	});

	it('rejects bytes without the expected columns', () => {
		expect(() => parseCoordinates(new Uint8Array([0, 1, 2]))).toThrow();
	});
});
