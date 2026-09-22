/**
 * Hit-testing for the canvas: a `d3-quadtree` over point *indices* in data space, so
 * hover/click can find the nearest visible game without scanning 36k points per event.
 * Built once per projection/axes change (not per zoom — the tree is in data units and the
 * search radius is converted from screen pixels by the caller).
 */
import { quadtree, type Quadtree } from 'd3-quadtree';

export type PointIndex = Quadtree<number>;

export function buildIndex(xs: ArrayLike<number>, ys: ArrayLike<number>, visible?: Uint8Array): PointIndex {
	const tree = quadtree<number>()
		.x((i) => xs[i])
		.y((i) => ys[i]);
	const n = xs.length;
	const idx: number[] = [];
	for (let i = 0; i < n; i++) {
		if (visible && !visible[i]) continue;
		if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) idx.push(i);
	}
	tree.addAll(idx);
	return tree;
}

/** Nearest point index within `radius` (data units), or -1. */
export function nearest(tree: PointIndex, x: number, y: number, radius: number): number {
	const found = tree.find(x, y, radius);
	return found === undefined ? -1 : found;
}
