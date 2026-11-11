import { describe, it, expect } from 'vitest';
import { planTween, interpolate, easeOutCubic, type TweenTree } from './genealogy-tween';

/** Positions by game index: game i sits at (i, -i). */
const at = (n: number, f = 1) => ({ x: Float32Array.from({ length: n }, (_, i) => i * f), y: Float32Array.from({ length: n }, (_, i) => -i * f) });
const tree = (centre: number, edges: [number, number][]): TweenTree => ({
	centre,
	nodes: [{ i: centre, via: -1 }, ...edges.map(([i, via]) => ({ i, via }))]
});

describe('planTween', () => {
	it('grows a first tree out of the centre', () => {
		const target = at(5);
		const p = planTween(5, null, null, tree(2, [[0, 2], [4, 2]]), target);
		for (const i of [0, 2, 4]) expect([p.fromX[i], p.fromY[i]]).toEqual([2, -2]);
		expect([p.toX[4], p.toY[4]]).toEqual([4, -4]);
		expect(p.leaving).toEqual([]);
	});

	it('moves a game that stays from where it is to where it goes', () => {
		const shown = at(5, 10);
		const p = planTween(5, tree(0, [[1, 0]]), shown, tree(0, [[1, 0]]), at(5));
		expect([p.fromX[1], p.toX[1]]).toEqual([10, 1]);
	});

	it('grows entering games outward: each from its parent, a step after it', () => {
		const shown = at(6, 10);
		// Old: 0 ← 1. New: 0 ← 1 ← 2 ← 3 (2 and 3 are new).
		const p = planTween(6, tree(0, [[1, 0]]), shown, tree(0, [[1, 0], [2, 1], [3, 2]]), at(6));
		// 2 comes out of 1 where it's on screen, straight away.
		expect([p.fromX[2], p.fromY[2], p.level[2]]).toEqual([10, -10, 0]);
		// 3 comes out of where 2 lands, one step later.
		expect([p.fromX[3], p.fromY[3], p.level[3]]).toEqual([2, -2, 1]);
		expect([p.level[1], p.levels]).toEqual([0, 1]);
	});

	it("a first view's rings set off one after another, the first at once", () => {
		const p = planTween(6, null, null, tree(0, [[1, 0], [2, 0], [3, 1]]), at(6));
		expect([p.level[1], p.level[2], p.level[3]]).toEqual([0, 0, 1]);
		expect([p.fromX[3], p.fromY[3]]).toEqual([1, -1]);
	});

	it('sends a leaving game into its nearest ancestor that stays, and marks it leaving', () => {
		const shown = at(6, 10);
		// Old: 0 ← 1 ← 2 ← 3. New: 0 ← 1 (a fold of 1).
		const p = planTween(6, tree(0, [[1, 0], [2, 1], [3, 2]]), shown, tree(0, [[1, 0]]), at(6));
		expect(p.leaving.sort()).toEqual([2, 3]);
		expect([p.fromX[3], p.toX[3], p.toY[3]]).toEqual([30, 1, -1]);
	});

	it('on a re-centre, a game with no surviving ancestor glides into the new centre', () => {
		const shown = at(6, 10);
		const p = planTween(6, tree(0, [[1, 0]]), shown, tree(4, [[5, 4]]), at(6));
		expect(p.leaving.sort()).toEqual([0, 1]);
		expect(p.toX[1]).toBe(4);
		// The new tree had nothing on screen: it grows out of its own centre.
		expect(p.fromX[5]).toBe(4);
	});
});

describe('interpolate', () => {
	it('lands exactly on the targets at e = 1 and starts on the sources at e = 0', () => {
		const p = planTween(3, tree(0, [[1, 0]]), at(3, 10), tree(0, [[1, 0]]), at(3));
		const out = { x: new Float32Array(3), y: new Float32Array(3) };
		interpolate(p, 0, out);
		expect(out.x[1]).toBe(10);
		interpolate(p, easeOutCubic(1), out);
		expect(out.x[1]).toBe(1);
	});
	it('per level: a later level is still at its start while an earlier one moves', () => {
		const p = planTween(4, null, null, tree(0, [[1, 0], [2, 1]]), at(4));
		const out = { x: new Float32Array(4), y: new Float32Array(4) };
		interpolate(p, (l) => (l === 0 ? 0.5 : 0), out);
		expect([out.x[1], out.x[2]]).toEqual([0.5, 1]);
	});
});
