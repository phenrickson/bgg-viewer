import { describe, expect, it } from 'vitest';
import { placeLabels, wrap } from './labels';

const measure = (s: string) => s.length * 6;
const m = { measure, lineHeight: 14, maxWidth: 60, padX: 2, padY: 1 };
const bounds = { x: 0, y: 0, width: 400, height: 300 };

describe('wrap', () => {
	it('breaks on words to fit the width and keeps an oversized word whole', () => {
		expect(wrap('The Campaign for North Africa', measure, 60)).toEqual(['The', 'Campaign', 'for North', 'Africa']);
		expect(wrap('Supercalifragilistic', measure, 60)).toEqual(['Supercalifragilistic']);
	});
});

describe('placeLabels', () => {
	it('keeps every label clear of its own point by the gap', () => {
		const out = placeLabels([{ x: 200, y: 150, text: 'Brass', gap: 6 }], m, bounds);
		const p = out[0];
		const inside = p.x > p.bx && p.x < p.bx + p.bw && p.y > p.by && p.y < p.by + p.bh;
		expect(inside).toBe(false);
		const dx = Math.max(p.bx - p.x, 0, p.x - (p.bx + p.bw));
		const dy = Math.max(p.by - p.y, 0, p.y - (p.by + p.bh));
		expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(6);
	});
	it('separates two labels anchored at the same point', () => {
		const out = placeLabels(
			[{ x: 200, y: 150, text: 'One', gap: 4 }, { x: 202, y: 150, text: 'Two', gap: 4 }],
			m,
			bounds
		);
		const [a, b] = out;
		const overlap = a.bx < b.bx + b.bw && a.bx + a.bw > b.bx && a.by < b.by + b.bh && a.by + a.bh > b.by;
		expect(overlap).toBe(false);
	});
	it('keeps a label at the edge inside the bounds', () => {
		const out = placeLabels([{ x: 398, y: 298, text: 'Edge', gap: 4 }], m, bounds);
		expect(out[0].bx + out[0].bw).toBeLessThanOrEqual(bounds.width);
		expect(out[0].by + out[0].bh).toBeLessThanOrEqual(bounds.height);
	});
});

describe('placeLabels with drop', () => {
	const m = { measure: (s: string) => s.length * 6, lineHeight: 14, maxWidth: 150, padX: 4, padY: 2 };
	const bounds = { x: 0, y: 0, width: 400, height: 300 };
	it('keeps a second label by moving it to a clear side rather than dropping it', () => {
		const out = placeLabels(
			[{ x: 200, y: 150, text: 'first', gap: 4 }, { x: 200, y: 166, text: 'second', gap: 4 }],
			m, bounds, { drop: true }
		);
		expect(out.map((p) => p.text)).toEqual(['first', 'second']);
		// first goes right, centred; second's right-centred box would overlap it, so it
		// takes the next clear position (left) instead of being dropped
		expect(out[0].bx).toBeGreaterThan(200);
		const [a, b] = out;
		const overlap = a.bx < b.bx + b.bw && b.bx < a.bx + a.bw && a.by < b.by + b.bh && b.by < a.by + a.bh;
		expect(overlap).toBe(false);
	});
	it('drops a label boxed in on every side', () => {


		// Eight labels at the same anchor use up every position; a ninth has nowhere to go.
		const items = Array.from({ length: 9 }, (_, i) => ({ x: 200, y: 150, text: `label ${i}`, gap: 2 }));
		const out = placeLabels(items, m, bounds, { drop: true });
		expect(out.length).toBeLessThan(9);
		expect(out[0].text).toBe('label 0');
	});
});
