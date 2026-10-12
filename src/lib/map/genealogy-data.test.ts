import { describe, it, expect } from 'vitest';
import { rowsToArrowIPC } from '$lib/server/similar-explorer/serialize';
import { parseGenealogyDataset } from './genealogy-data';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';

function coords(ids: number[], version = 6): CoordinateSet {
	return {
		ids: Int32Array.from(ids), pcs: [], umap: [new Float32Array(), new Float32Array()], k: 2,
		model: 'embeddings-v2026', version, index: new Map(ids.map((id, i) => [id, i]))
	};
}
const facts = (years: number[]) => ({ year: Int16Array.from(years) }) as unknown as GameFacts;
const row = (game_id: number, emb: number[], extra: Record<string, unknown> = {}) => ({
	game_id, complexity: 2, min_playtime: 30, max_playtime: 60, embedding: emb,
	family_ids: [], family_labels: [], related_ids: [], product_line_id: null,
	embedding_version: 6, embedding_model: 'embeddings-v2026', ...extra
});

describe('parseGenealogyDataset', () => {
	it('aligns vectors, families and related ids to coordinates order', () => {
		const buf = rowsToArrowIPC([
			row(20, [0, 2], { family_ids: [5], related_ids: [10] }),
			row(10, [3, 0])
		]);
		const d = parseGenealogyDataset(buf, coords([10, 20, 30]), facts([2007, 2013, 2016]));
		expect(d.n).toBe(3);
		expect(Array.from(d.emb.slice(0, 2))).toEqual([1, 0]); // id 10, normalised
		expect(Array.from(d.emb.slice(2, 4))).toEqual([0, 1]); // id 20
		expect(d.families[1]).toEqual([5]);
		expect(d.related[1]).toEqual([10]);
		expect(d.has(2)).toBe(false); // id 30 has no vector
		expect(Array.from(d.year)).toEqual([2007, 2013, 2016]);
	});
	it('refuses a dataset from a different embedding version than the coordinates', () => {
		const buf = rowsToArrowIPC([row(10, [1, 0])]);
		expect(() => parseGenealogyDataset(buf, coords([10], 7), facts([2007]))).toThrow(/v6.*v7/);
	});
	it('refuses a dataset cached before version stamping, naming the fix', () => {
		const buf = rowsToArrowIPC([row(10, [1, 0], { embedding_version: null, embedding_model: null })]);
		expect(() => parseGenealogyDataset(buf, coords([10]), facts([2007]))).toThrow(/similar-rebuild/);
	});
});
