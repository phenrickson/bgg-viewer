import { describe, it, expect } from 'vitest';
import { tableFromIPC } from 'apache-arrow';
import { rowsToArrowIPC, META_VERSION, META_MODEL, META_K, type CoordinateRow } from './serialize';

function row(game_id: number, version = 6, model = 'embeddings-v2026'): CoordinateRow {
	return {
		game_id: { value: String(game_id) }, // BigQuery INT64 wrapper
		pc_1: 1.5,
		pc_2: -0.25,
		pc_3: 0,
		pc_4: 0.1,
		pc_5: 0.2,
		pc_6: 0.3,
		umap_1: 3.25,
		umap_2: -7.5,
		embedding_version: { value: String(version) },
		embedding_model: model
	} as CoordinateRow;
}

describe('rowsToArrowIPC', () => {
	it('round-trips typed columns and carries the model identity as schema metadata', () => {
		const table = tableFromIPC(rowsToArrowIPC([row(13), row(188)]));
		expect(table.numRows).toBe(2);
		expect(table.schema.fields.map((f) => f.name)).toEqual([
			'game_id',
			'pc_1',
			'pc_2',
			'pc_3',
			'pc_4',
			'pc_5',
			'pc_6',
			'umap_1',
			'umap_2'
		]);
		expect(String(table.schema.fields[0].type)).toBe('Int32');
		expect(String(table.schema.fields[1].type)).toBe('Float32');
		expect(table.getChild('game_id')!.get(1)).toBe(188);
		expect(table.getChild('pc_1')!.get(0)).toBeCloseTo(1.5);
		expect(table.getChild('umap_2')!.get(0)).toBeCloseTo(-7.5);
		expect(table.schema.metadata.get(META_VERSION)).toBe('6');
		expect(table.schema.metadata.get(META_MODEL)).toBe('embeddings-v2026');
		expect(table.schema.metadata.get(META_K)).toBe('6');
	});

	it('encodes a null coordinate as NaN rather than dropping the row', () => {
		const r = row(1);
		r.umap_1 = null;
		const table = tableFromIPC(rowsToArrowIPC([r]));
		expect(Number.isNaN(table.getChild('umap_1')!.get(0))).toBe(true);
	});

	it('refuses to serialize rows from more than one model version', () => {
		expect(() => rowsToArrowIPC([row(1, 5), row(2, 6)])).toThrow(/2 versions/);
		expect(() => rowsToArrowIPC([row(1, 6, 'a'), row(2, 6, 'b')])).toThrow(/2 models/);
	});

	it('serializes an empty row set without throwing', () => {
		expect(tableFromIPC(rowsToArrowIPC([])).numRows).toBe(0);
	});
});
