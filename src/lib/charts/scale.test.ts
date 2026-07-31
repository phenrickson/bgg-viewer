import { describe, it, expect } from 'vitest';
import { barScale, type Bar } from './scale';

/** The universe, and a scope that kept only the last two bins — a strict subset. */
const UNIVERSE: Bar[] = [{ n: 100 }, { n: 50 }, { n: 10 }];
const SCOPE: Bar[] = [{ n: 0 }, { n: 50 }, { n: 10 }];

describe('barScale — count', () => {
	it('draws equal counts at equal heights, whichever series they are in', () => {
		// The regression: scaling each series to its own peak drew the scope's 50 at full
		// height and the universe's 50 at half, implying the filter had added games.
		const s = barScale([UNIVERSE, SCOPE], 'count');
		const [uT, sT] = s.totals;
		expect(s.frac(50, uT)).toBe(s.frac(50, sT));
	});

	it('never draws a subset above the set it came from', () => {
		const s = barScale([UNIVERSE, SCOPE], 'count');
		const [uT, sT] = s.totals;
		UNIVERSE.forEach((u, i) => {
			expect(s.frac(SCOPE[i].n, sT)).toBeLessThanOrEqual(s.frac(u.n, uT));
		});
	});

	it('fills the plot at the tallest bar and bottoms out at zero', () => {
		const s = barScale([UNIVERSE, SCOPE], 'count');
		expect(s.frac(100, s.totals[0])).toBe(1);
		expect(s.frac(0, s.totals[0])).toBe(0);
	});

	it('reports each series total', () => {
		expect(barScale([UNIVERSE, SCOPE], 'count').totals).toEqual([160, 60]);
	});
});

describe('barScale — share', () => {
	it('makes a small scope legible where counts would flatten it', () => {
		const tiny: Bar[] = [{ n: 0 }, { n: 3 }, { n: 1 }];
		const counts = barScale([UNIVERSE, tiny], 'count');
		const shares = barScale([UNIVERSE, tiny], 'share');
		expect(counts.frac(3, counts.totals[1])).toBeLessThan(0.05); // an invisible sliver
		expect(shares.frac(3, shares.totals[1])).toBeGreaterThan(0.5); // a readable shape
	});

	it('puts both series on one share denominator', () => {
		// Equal shares must draw at equal heights even when the sets differ in size.
		const a: Bar[] = [{ n: 25 }, { n: 75 }]; // 25% / 75%
		const b: Bar[] = [{ n: 1 }, { n: 3 }]; // 25% / 75%
		const s = barScale([a, b], 'share');
		expect(s.frac(25, s.totals[0])).toBeCloseTo(s.frac(1, s.totals[1]), 10);
		expect(s.frac(75, s.totals[0])).toBeCloseTo(s.frac(3, s.totals[1]), 10);
	});

	it('shows a concentrated scope as taller — the point of the mode', () => {
		const flat: Bar[] = [{ n: 50 }, { n: 50 }]; // 50/50
		const spike: Bar[] = [{ n: 10 }, { n: 0 }]; // 100/0
		const s = barScale([flat, spike], 'share');
		expect(s.frac(10, s.totals[1])).toBe(1);
		expect(s.frac(50, s.totals[0])).toBeCloseTo(0.5, 10);
	});
});

describe('barScale — degenerate input', () => {
	it('survives empty and all-zero series without NaN or divide-by-zero', () => {
		for (const mode of ['count', 'share'] as const) {
			const s = barScale([[], [{ n: 0 }]], mode);
			expect(s.totals).toEqual([0, 0]);
			expect(s.frac(0, 0)).toBe(0);
			expect(Number.isFinite(s.frac(5, 0))).toBe(true);
		}
	});
});
