import { describe, it, expect } from 'vitest';
import { buildIndex, nearest } from './quadtree';

describe('point index', () => {
	const xs = Float32Array.from([0, 10, 20, NaN, 5]);
	const ys = Float32Array.from([0, 10, 20, 0, 5]);

	it('finds the nearest point within the radius, by index', () => {
		const tree = buildIndex(xs, ys);
		expect(nearest(tree, 9, 9, 3)).toBe(1);
		expect(nearest(tree, 4, 6, 3)).toBe(4);
		expect(nearest(tree, 100, 100, 3)).toBe(-1);
	});

	it('skips non-finite coordinates and points masked out as invisible', () => {
		const visible = Uint8Array.from([1, 0, 1, 1, 1]);
		const tree = buildIndex(xs, ys, visible);
		expect(nearest(tree, 10, 10, 1)).toBe(-1); // index 1 hidden
		expect(nearest(tree, 0, 0, 1)).toBe(0);
		expect(tree.size()).toBe(3); // 0, 2, 4 — NaN row 3 dropped
	});
});
