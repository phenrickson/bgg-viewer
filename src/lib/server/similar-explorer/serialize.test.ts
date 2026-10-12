import { describe, it, expect } from 'vitest';
import { tableFromIPC } from 'apache-arrow';
import { rowsToArrowIPC, META_VERSION, META_MODEL } from './serialize';

const row = (game_id: number, v: unknown = { value: '6' }, m = 'embeddings-v2026') => ({
	game_id,
	complexity: 2.5,
	min_playtime: 30,
	max_playtime: 60,
	embedding: [1, 0],
	family_ids: [{ value: '7' }],
	family_labels: ['Game: X'],
	related_ids: [],
	product_line_id: null,
	embedding_version: v,
	embedding_model: m
});

describe('rowsToArrowIPC', () => {
	it('stamps the embedding version and model into the schema metadata', () => {
		const t = tableFromIPC(rowsToArrowIPC([row(1), row(2)]));
		expect(t.schema.metadata.get(META_VERSION)).toBe('6');
		expect(t.schema.metadata.get(META_MODEL)).toBe('embeddings-v2026');
		expect(t.numRows).toBe(2);
		expect(Array.from(t.getChild('family_ids')!.get(0)!.toArray())).toEqual([7]);
	});
	it('refuses rows from more than one embedding version', () => {
		expect(() => rowsToArrowIPC([row(1, 6), row(2, 7)])).toThrow(/versions/);
	});
});
