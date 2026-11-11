import { describe, it, expect, vi } from 'vitest';
import type { VectorSet } from '$lib/recommend/vectors';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';

vi.mock('$lib/catalog/catalog.svelte', () => ({ queryColumns: vi.fn() }));
const { buildGenealogyInput } = await import('./genealogy-data');

function coords(ids: number[], version = 6): CoordinateSet {
	return {
		ids: Int32Array.from(ids), pcs: [], umap: [new Float32Array(), new Float32Array()], k: 2,
		model: 'embeddings-v2026', version, index: new Map(ids.map((id, i) => [id, i]))
	};
}
const facts = (years: number[]) => ({ year: Int16Array.from(years) }) as unknown as GameFacts;
/** Two-d unit vectors in artifact order (already normalised, as `parseVectors` leaves them). */
function vectors(rows: [id: number, v: [number, number]][], version = 6): VectorSet {
	return {
		ids: Int32Array.from(rows, (r) => r[0]),
		vec: Float32Array.from(rows.flatMap((r) => r[1])),
		version
	} as unknown as VectorSet;
}
const noFamilies = { game_id: [], family_id: [] };

describe('buildGenealogyInput', () => {
	it('aligns vectors and families to coordinates order', () => {
		const d = buildGenealogyInput(
			vectors([[20, [0, 1]], [10, [1, 0]], [99, [1, 0]]]),
			{ game_id: [20, 20, 10, 99], family_id: [5, 8, 5, 3] },
			coords([10, 20, 30]),
			facts([2007, 2013, 2016])
		);
		expect(d.n).toBe(3);
		expect(d.dim).toBe(2);
		expect(Array.from(d.emb.slice(0, 2))).toEqual([1, 0]); // id 10
		expect(Array.from(d.emb.slice(2, 4))).toEqual([0, 1]); // id 20
		expect(d.families).toEqual([[5], [5, 8], []]); // id 99 isn't on the map
		expect(d.has(2)).toBe(false); // id 30 has no vector
		expect(Array.from(d.year)).toEqual([2007, 2013, 2016]);
	});
	it('loads anyway, with a warning, when the vectors and coordinates are different runs', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(buildGenealogyInput(vectors([[10, [1, 0]]]), noFamilies, coords([10], 7), facts([2007])).has(0)).toBe(true);
		expect(String(warn.mock.calls[0]?.[0])).toMatch(/v6.*v7/);
		warn.mockRestore();
	});
	it('loads anyway, with a warning, when the vectors have no version stamp', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(buildGenealogyInput(vectors([[10, [1, 0]]], NaN), noFamilies, coords([10]), facts([2007])).has(0)).toBe(true);
		expect(String(warn.mock.calls[0]?.[0])).toMatch(/no embedding version/);
		warn.mockRestore();
	});
});
