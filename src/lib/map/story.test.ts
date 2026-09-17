import { describe, expect, it } from 'vitest';
import { resolveStep, STEPS, BASE_VIEW } from './story';
import type { CoordinateSet } from './coordinates';
import type { NeighboursArtifact } from './neighbours';

function coordsOf(ids: number[]): CoordinateSet {
	const arr = Int32Array.from(ids);
	return {
		ids: arr,
		pcs: [new Float32Array(ids.length), new Float32Array(ids.length)],
		umap: [new Float32Array(ids.length), new Float32Array(ids.length)],
		k: 2,
		model: 't',
		version: 1,
		index: new Map(ids.map((id, i) => [id, i]))
	};
}

const coords = coordsOf([1, 2, 3, 4, 5]);
const neighbours: NeighboursArtifact = {
	model: 't',
	version: 1,
	n: 3,
	all: { '1': [{ id: 5, sim: 0.9 }, { id: 2, sim: 0.8 }, { id: 99, sim: 0.7 }] },
	upcoming: { '1': [{ id: 3, sim: 0.5 }] }
};

describe('resolveStep', () => {
	it('selects and frames a neighbourhood, anchoring the source game', () => {
		const r = resolveStep({ id: 'x', title: '', body: [], view: {}, neighboursOf: 1, n: 2 }, coords, neighbours);
		expect(r.view.selected).toEqual([5, 2]);
		expect(r.focus).toEqual([1, 5, 2]);
		expect(r.anchors).toEqual([1]);
	});
	it('drops neighbours the artifact lacks and honours upcomingOnly', () => {
		expect(resolveStep({ id: 'x', title: '', body: [], view: {}, neighboursOf: 1, n: 3 }, coords, neighbours).view.selected).toEqual([5, 2]);
		expect(resolveStep({ id: 'x', title: '', body: [], view: {}, neighboursOf: 1, upcomingOnly: true }, coords, neighbours).view.selected).toEqual([3]);
	});
	it('is empty for a source with no precomputed neighbours', () => {
		const r = resolveStep({ id: 'x', title: '', body: [], view: {}, neighboursOf: 4 }, coords, neighbours);
		expect(r.view.selected).toEqual([]);
		expect(r.focus).toEqual([4]);
	});
	it('drops anchors the artifact lacks and falls back to the base view', () => {
		const r = resolveStep({ id: 'x', title: '', body: [], view: { colour: 'geek' }, anchors: [2, 99] }, coords, neighbours);
		expect(r.anchors).toEqual([2]);
		expect(r.focus).toBeNull();
		expect(r.view).toEqual({ ...BASE_VIEW, colour: 'geek', selected: [] });
	});
	it('every shipped step has unique ids and non-empty prose', () => {
		expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
		for (const s of STEPS) expect(s.body.length).toBeGreaterThan(0);
	});
});
