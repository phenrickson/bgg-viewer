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

export function placeLabels(
	items: LabelInput[],
	m: LabelMetrics,
	bounds: { x: number; y: number; width: number; height: number }
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
