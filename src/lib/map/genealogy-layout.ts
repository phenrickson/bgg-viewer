/**
 * Where a genealogy's games sit: top-down, ancestors above the chosen game, descendants
 * below, same-year games on its row. y is the publication year on a log scale of distance
 * from the chosen game's year (near years spread, far ones compress), or the generation
 * (evenly spaced rows). x is a tidy-tree spread
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
/** Year mode: one unit of log(1 + years from the centre). */
const YEAR = 1.2;
const FIT = 1.8;
/**
 * The layer stretches the data square over the whole canvas, so x and y are fitted
 * separately: y always fills the height, x fills the width up to this many NDC per slot,
 * so a two-game tree stays a tree instead of splaying across the screen. Fitting each
 * axis on its own also keeps a long Year-mode span (a 1990 game whose ancestor is Go,
 * −2200) from crushing x to a hairline.
 */
const SLOT_NDC_MAX = 0.3;
/** Year ticks: these many years out from the centre, each side, while in range. */
const TICK_DISTANCES = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
/**
 * Year mode's y: log(1 + years from the centre), signed so earlier is up. One old outlier
 * (a 2001 ancestor of a 2024 game) would otherwise stretch the axis and squash every recent
 * year into a sliver; on a log scale the years near the chosen game keep their room.
 */
const yearY = (centreYear: number, y: number) => {
	const d = centreYear - y;
	return Math.sign(d) * Math.log1p(Math.abs(d)) * YEAR;
};

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
		// Two slots apart, not one: same-year games sit beside the centre's own label.
		lx[j] = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2 * SLOT;
	});

	const cy = year[g.centre];
	nodes.forEach((nd, j) => {
		ly[j] = mode === 'gen' ? -nd.gen * ROW : yearY(cy, year[nd.i]);
	});

	let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
	for (let j = 0; j < m; j++) {
		x0 = Math.min(x0, lx[j]); x1 = Math.max(x1, lx[j]);
		y0 = Math.min(y0, ly[j]); y1 = Math.max(y1, ly[j]);
	}
	const sx = x1 > x0 ? Math.min(FIT / (x1 - x0), SLOT_NDC_MAX / SLOT) : 1;
	const sy = y1 > y0 ? FIT / (y1 - y0) : 1;
	const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
	const x = new Float32Array(m), y = new Float32Array(m);
	for (let j = 0; j < m; j++) { x[j] = (lx[j] - ox) * sx; y[j] = (ly[j] - oy) * sy; }
	const toY = (v: number) => (v - oy) * sy;

	const ticks: Tick[] = [];
	if (mode === 'gen') {
		const gens = nodes.map((nd) => nd.gen);
		for (let gn = Math.min(...gens); gn <= Math.max(...gens); gn++) ticks.push({ label: genLabel(gn), y: toY(-gn * ROW) });
	} else {
		const ys = nodes.map((nd) => year[nd.i]);
		const lo = Math.min(...ys), hi = Math.max(...ys);
		const years = new Set<number>();
		for (const d of TICK_DISTANCES) {
			if (cy - d >= lo) years.add(cy - d);
			if (cy + d <= hi) years.add(cy + d);
		}
		for (const v of [...years].sort((a, b) => a - b)) ticks.push({ label: String(v), y: toY(yearY(cy, v)) });
	}
	return { genealogy: g, x, y, ticks };
}

/**
 * The canvas camera is a translate plus a per-axis scale (the layer stretches the data
 * square to the canvas), so two points at distinct NDC y fix the y → screen map. The
 * overlay only gets screen positions of points; this lets it place the year ticks too.
 */
export function ndcToScreenY(a: { y: number; py: number }, b: { y: number; py: number }): ((y: number) => number) | null {
	if (Math.abs(b.y - a.y) < 1e-9) return null;
	const k = (b.py - a.py) / (b.y - a.y);
	return (y) => a.py + k * (y - a.y);
}

/**
 * Centre of a badge token (⊕12 / +12) that was appended to its game's label, so the label
 * placer reserved room for it — the HTML button is laid exactly over the drawn token. The
 * token is the end of the label's last line.
 */
export function badgeCentre(
	box: { bx: number; by: number; lines: string[] },
	measure: (s: string) => number,
	token: string,
	m: { lineHeight: number; padX: number; padY: number }
): [number, number] {
	const k = box.lines.length - 1;
	const end = box.bx + m.padX + measure(box.lines[k]);
	return [end - measure(token) / 2, box.by + m.padY + m.lineHeight * (k + 0.5)];
}

/**
 * The order the label placer takes games in — it keeps a label only if it fits clear of
 * those already placed, so this is the priority. The centre, then what you're pointing at,
 * then games you've unfolded (their label carries the ⊖ that folds them back — losing it to
 * their own children would strand them), then the most-rated: in a flurry the recognisable
 * games win the space, and zooming in makes room for the long tail.
 */
export function labelOrder(
	nodes: number[], centre: number, selected: number, hovered: number,
	usersRated: ArrayLike<number>, unfolded: ReadonlySet<number>
): number[] {
	const rank = (i: number) => (i === centre ? 0 : i === selected ? 1 : i === hovered ? 2 : unfolded.has(i) ? 3 : 4);
	return [...nodes].sort((a, b) => rank(a) - rank(b) || usersRated[b] - usersRated[a] || a - b);
}

/** Same-year arc height per unit of horizontal distance, and its ceiling (NDC). */
const ARC_BOW = 0.12, ARC_CAP = 0.06;

/**
 * The link from the chosen game to a same-year game: a shallow arc just above their shared
 * row. Height grows with distance, so the arc to the second game out clears the first,
 * but is capped so it never reaches into another year's row.
 */
export function sameYearArc(a: [number, number], b: [number, number], segments = 16): [number, number][] {
	const h = Math.min(ARC_BOW * Math.abs(b[0] - a[0]), ARC_CAP);
	// A quadratic peaks at half its control point's offset: put the control at 2h.
	const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2 + 2 * h;
	const pts: [number, number][] = [];
	for (let k = 0; k <= segments; k++) {
		const t = k / segments, u = 1 - t;
		pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
	}
	return pts;
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
