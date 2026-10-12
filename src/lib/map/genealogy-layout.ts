/**
 * Where a genealogy's games sit: top-down, ancestors above the chosen game, descendants
 * below, same-year games on its row. y is the publication year (a long edge is a long gap,
 * a flurry is a dense band) or the generation (evenly spaced rows). x is a tidy-tree spread
 * per half: leaves take consecutive slots and a parent sits over the middle of its
 * children, so links cross as little as they can.
 *
 * Output is NDC fitted to [-0.9, 0.9] like `layoutEgoNetwork`, so `PointCanvas` can fly
 * points into it. Also here: the small geometry the layer needs for edges and the axis.
 */
import type { Genealogy } from './genealogy';

export type YMode = 'year' | 'gen';

export interface Tick {
	label: string;
	/** NDC. */
	y: number;
}

export interface GenealogyLayout {
	genealogy: Genealogy;
	/** NDC, parallel to `genealogy.nodes`. */
	x: Float32Array;
	y: Float32Array;
	ticks: Tick[];
}

/** Layout units: one leaf slot across, one generation down, one year down. Only ratios matter. */
const SLOT = 1;
const ROW = 1.6;
const YEAR = 0.35;
const FIT = 1.8;

const mid = (xs: number[]) => (xs[0] + xs[xs.length - 1]) / 2;
const genLabel = (g: number) => (g === 0 ? '0' : g > 0 ? `+${g}` : `−${-g}`);

export function layoutGenealogy(g: Genealogy, year: Int16Array, mode: YMode): GenealogyLayout {
	const nodes = g.nodes;
	const m = nodes.length;
	const lx = new Float64Array(m), ly = new Float64Array(m);

	/** `${parent index}:${side}` → positions in `nodes` of its children on that side. */
	const kids = new Map<string, number[]>();
	nodes.forEach((nd, j) => {
		if (nd.side !== 'up' && nd.side !== 'down') return;
		const key = `${nd.via}:${nd.side}`;
		const list = kids.get(key);
		if (list) list.push(j);
		else kids.set(key, [j]);
	});

	for (const side of ['up', 'down'] as const) {
		let next = 0;
		const members: number[] = [];
		const place = (j: number): number => {
			members.push(j);
			const cs = kids.get(`${nodes[j].i}:${side}`) ?? [];
			lx[j] = cs.length ? mid(cs.map(place)) : next++ * SLOT;
			return lx[j];
		};
		const xs = (kids.get(`${g.centre}:${side}`) ?? []).map(place);
		const shift = xs.length ? mid(xs) : 0;
		for (const j of members) lx[j] -= shift;
	}

	let k = 0;
	nodes.forEach((nd, j) => {
		if (nd.side !== 'same') return;
		k++;
		lx[j] = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * SLOT;
	});

	const cy = year[g.centre];
	nodes.forEach((nd, j) => {
		ly[j] = mode === 'gen' ? -nd.gen * ROW : (cy - year[nd.i]) * YEAR;
	});

	let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
	for (let j = 0; j < m; j++) {
		x0 = Math.min(x0, lx[j]); x1 = Math.max(x1, lx[j]);
		y0 = Math.min(y0, ly[j]); y1 = Math.max(y1, ly[j]);
	}
	const span = Math.max(x1 - x0, y1 - y0);
	const s = span > 0 ? FIT / span : 1;
	const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
	const x = new Float32Array(m), y = new Float32Array(m);
	for (let j = 0; j < m; j++) { x[j] = (lx[j] - ox) * s; y[j] = (ly[j] - oy) * s; }
	const toY = (v: number) => (v - oy) * s;

	const ticks: Tick[] = [];
	if (mode === 'gen') {
		const gens = nodes.map((nd) => nd.gen);
		for (let gn = Math.min(...gens); gn <= Math.max(...gens); gn++) ticks.push({ label: genLabel(gn), y: toY(-gn * ROW) });
	} else {
		const ys = nodes.map((nd) => year[nd.i]);
		const lo = Math.min(...ys), hi = Math.max(...ys);
		const step = hi - lo <= 12 ? 1 : hi - lo <= 30 ? 5 : 10;
		for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push({ label: String(v), y: toY((cy - v) * YEAR) });
	}
	return { genealogy: g, x, y, ticks };
}

/**
 * The canvas camera is a translate plus a uniform scale (the data square is never
 * stretched on this page), so two points with distinct NDC fix the NDC → screen map. The
 * overlay only gets screen positions of points; this lets it place axis ticks too.
 */
export function ndcToScreen(
	a: { ndc: [number, number]; px: [number, number] },
	b: { ndc: [number, number]; px: [number, number] }
): ((x: number, y: number) => [number, number]) | null {
	const dx = b.ndc[0] - a.ndc[0], dy = b.ndc[1] - a.ndc[1];
	const d2 = dx * dx + dy * dy;
	if (d2 < 1e-12) return null;
	const k = ((b.px[0] - a.px[0]) * dx - (b.px[1] - a.px[1]) * dy) / d2;
	return (x, y) => [a.px[0] + k * (x - a.ndc[0]), a.px[1] - k * (y - a.ndc[1])];
}

/** Cut a polyline into dashes: `on` drawn, `off` skipped, in the polyline's own units. */
export function dashed(points: [number, number][], on: number, off: number): [number, number][][] {
	const out: [number, number][][] = [];
	let drawing = true, left = on;
	let cur: [number, number][] = [points[0]];
	for (let k = 1; k < points.length; k++) {
		let [ax, ay] = points[k - 1];
		const [bx, by] = points[k];
		let seg = Math.hypot(bx - ax, by - ay);
		while (seg > left) {
			const t = left / seg;
			const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
			if (drawing) { cur.push([px, py]); out.push(cur); } else cur = [[px, py]];
			drawing = !drawing;
			seg -= left;
			left = drawing ? on : off;
			ax = px; ay = py;
		}
		left -= seg;
		if (drawing) cur.push([bx, by]);
	}
	if (drawing && cur.length > 1) out.push(cur);
	return out;
}

/** A polyline moved `d` along its left normal — the second stroke of a double line. */
export function offset(points: [number, number][], d: number): [number, number][] {
	return points.map((p, k) => {
		const a = points[Math.max(0, k - 1)], b = points[Math.min(points.length - 1, k + 1)];
		const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
		return [p[0] - (dy / len) * d, p[1] + (dx / len) * d];
	});
}
