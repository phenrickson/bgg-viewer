import { describe, it, expect } from 'vitest';
import { framer, FRAME_PAD, linkStrength } from './lineage-encoding';

describe('linkStrength', () => {
	it('is fixed by the floor, not by the other links on screen', () => {
		expect(linkStrength(0.7, 0.7)).toBe(0);
		expect(linkStrength(1, 0.7)).toBe(1);
		expect(linkStrength(0.79, 0.7)).toBeCloseTo(0.3);
		// Below the floor (a family link) clamps to the thinnest.
		expect(linkStrength(0.5, 0.7)).toBe(0);
	});
});

const toPx = (ndc: number, size: number) => ((ndc + 1) / 2) * size;

describe('framer', () => {
	it("maps the layouts' [-0.9, 0.9] fit onto the canvas minus the padding", () => {
		const f = framer(1600, 1000);
		expect(toPx(f.x(-0.9), 1600)).toBeCloseTo(FRAME_PAD.left);
		expect(toPx(f.x(0.9), 1600)).toBeCloseTo(1600 - FRAME_PAD.right);
		// NDC y is up: +0.9 lands under the top padding, -0.9 above the bottom's.
		expect(1000 - toPx(f.y(0.9), 1000)).toBeCloseTo(FRAME_PAD.top);
		expect(1000 - toPx(f.y(-0.9), 1000)).toBeCloseTo(1000 - FRAME_PAD.bottom);
		expect([f.w, f.h]).toEqual([1600 - FRAME_PAD.left - FRAME_PAD.right, 1000 - FRAME_PAD.top - FRAME_PAD.bottom]);
	});
	it("falls back to the layouts' own fit when the canvas is too small for the padding", () => {
		const f = framer(300, 220);
		expect([f.x(0.5), f.y(-0.5)]).toEqual([0.5, -0.5]);
	});
});
