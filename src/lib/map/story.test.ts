import { describe, expect, it } from 'vitest';
import { nearest, resolveStep, STEPS, BASE_VIEW } from './story';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';

function coordsOf(points: Record<number, number[]>): CoordinateSet {
	const ids = Int32Array.from(Object.keys(points).map(Number));
	const k = Object.values(points)[0].length;
	const pcs = Array.from({ length: k }, (_, j) => Float32Array.from(ids, (id) => points[id][j]));
	return {
		ids,
		pcs,
		umap: [new Float32Array(ids.length), new Float32Array(ids.length)],
		k,
		model: 't',
		version: 1,
		index: new Map(Array.from(ids, (id, i) => [id, i]))
	};
}

const coords = coordsOf({
	1: [0, 0],
	2: [1, 0],
	3: [0, 2],
	4: [5, 5],
	5: [0.5, 0.5]
});
const facts = {
	upcoming: Uint8Array.from([0, 0, 1, 0, 1])
} as unknown as GameFacts;

describe('nearest', () => {
	it('returns the closest ids, nearest first, excluding the game itself', () => {
		expect(nearest(coords, 1, 3)).toEqual([5, 2, 3]);
	});
	it('honours a candidate filter', () => {
		expect(nearest(coords, 1, 3, (i) => facts.upcoming[i] === 1)).toEqual([5, 3]);
	});
	it('is empty for a game the artifact lacks', () => {
		expect(nearest(coords, 99, 3)).toEqual([]);
	});
});

describe('resolveStep', () => {
	it('selects and frames a neighbourhood, anchoring the source game', () => {
		const r = resolveStep(
			{ id: 'x', title: '', body: [], view: {}, neighboursOf: 1, n: 2 },
			coords,
			facts
		);
		expect(r.view.selected).toEqual([5, 2]);
		expect(r.focus).toEqual([1, 5, 2]);
		expect(r.anchors).toEqual([1]);
	});
	it('drops anchors the artifact lacks and falls back to the base view', () => {
		const r = resolveStep(
			{
				id: 'x',
				title: '',
				body: [],
				view: { colour: 'geek' },
				anchors: [2, 99]
			},
			coords,
			facts
		);
		expect(r.anchors).toEqual([2]);
		expect(r.focus).toBeNull();
		expect(r.view).toEqual({ ...BASE_VIEW, colour: 'geek', selected: [] });
	});
	it('every shipped step has unique ids and non-empty prose', () => {
		expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
		for (const s of STEPS) expect(s.body.length).toBeGreaterThan(0);
	});
});
