/**
 * Label placement for the map overlay, on d3fc's label-layout strategies: each label is a
 * rectangle anchored at its point; the strategy tries the eight placements around the
 * anchor (right/left × above/below/middle) and picks the set with the least overlap and
 * least spill outside the bounds. Greedy rather than annealing because the overlay
 * redraws on every hover and annealing is randomised — labels would jump.
 *
 * Only the pure strategy is imported (`src/greedy`), not the d3-selection component.
 */
import layoutGreedy from '@d3fc/d3fc-label-layout/src/greedy.js';

export interface LabelInput {
	/** Anchor (the point), CSS px. */
	x: number;
	y: number;
	text: string;
	/** Clearance to keep between the point and the label box, px. */
	gap: number;
}

export interface PlacedLabel extends LabelInput {
	lines: string[];
	/** Top-left of the text box (gap already applied), CSS px. */
	bx: number;
	by: number;
	bw: number;
	bh: number;
}

export interface LabelMetrics {
	measure: (s: string) => number;
	lineHeight: number;
	maxWidth: number;
	padX: number;
	padY: number;
}

/** Greedy word wrap to `maxWidth`; a single word longer than that stands alone. */
export function wrap(text: string, measure: (s: string) => number, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let cur = '';
	for (const w of words) {
		const next = cur ? `${cur} ${w}` : w;
		if (cur && measure(next) > maxWidth) {
			lines.push(cur);
			cur = w;
		} else cur = next;
	}
	if (cur) lines.push(cur);
	return lines;
}

type Rect = { x: number; y: number; width: number; height: number; hidden?: boolean };

/**
 * `drop`: place in input order (so put the important ones first), each label taking the
 * first of its eight positions that is clear of every label already kept and inside the
 * bounds; a label with no clear position is dropped. d3fc's greedy strategy minimises
 * total overlap but never refuses a label, so in a knot of close points it stacks them.
 */
export function placeLabels(
	items: LabelInput[],
	m: LabelMetrics,
	bounds: { x: number; y: number; width: number; height: number },
	opts: { drop?: boolean } = {}
): PlacedLabel[] {
	if (items.length === 0) return [];
	const wrapped = items.map((it) => {
		const lines = wrap(it.text, m.measure, m.maxWidth);
		const bw = Math.max(...lines.map(m.measure)) + 2 * m.padX;
		const bh = lines.length * m.lineHeight + 2 * m.padY;
		return { it, lines, bw, bh };
	});
	// The strategy places rectangles touching the anchor; inflating by the gap keeps the
	// text box that distance from the point whichever side it lands on.
	const rects: Rect[] = wrapped.map(({ it, bw, bh }) => ({
		x: it.x,
		y: it.y,
		width: bw + 2 * it.gap,
		height: bh + 2 * it.gap
	}));
	if (opts.drop) return placeOrDrop(wrapped, rects, bounds);
	const strategy = layoutGreedy().bounds(bounds);
	const out = strategy(rects) as Rect[];
	return wrapped.map(({ it, lines, bw, bh }, k) => ({
		...it,
		lines,
		bx: out[k].x + it.gap,
		by: out[k].y + it.gap,
		bw,
		bh
	}));
}

/** Where a label may sit relative to its anchor: (x, y) offsets as fractions of its size. */
const POSITIONS: [number, number][] = [
	[0, -0.5], // right, centred
	[-1, -0.5], // left, centred
	[0, -1], [0, 0], // right, above / below
	[-1, -1], [-1, 0], // left, above / below
	[-0.5, -1], [-0.5, 0] // centred, above / below
];

function placeOrDrop(
	wrapped: { it: LabelInput; lines: string[]; bw: number; bh: number }[],
	rects: Rect[],
	bounds: { x: number; y: number; width: number; height: number }
): PlacedLabel[] {
	const kept: Rect[] = [];
	const out: PlacedLabel[] = [];
	const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
	const inside = (r: Rect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.width <= bounds.x + bounds.width && r.y + r.height <= bounds.y + bounds.height;
	wrapped.forEach(({ it, lines, bw, bh }, k) => {
		const r = rects[k];
		for (const [fx, fy] of POSITIONS) {
			const cand: Rect = { x: it.x + fx * r.width, y: it.y + fy * r.height, width: r.width, height: r.height };
			if (!inside(cand) || kept.some((q) => overlaps(cand, q))) continue;
			kept.push(cand);
			out.push({ ...it, lines, bx: cand.x + it.gap, by: cand.y + it.gap, bw, bh });
			return;
		}
	});
	return out;
}
