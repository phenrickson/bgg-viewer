import { describe, it, expect } from 'vitest';
import { quantize, toBounds, toHandles, rangeLabel, type Domain } from './range';

const WEIGHT: Domain = { lo: 1, hi: 5 };

describe('quantize', () => {
	it('snaps to the step', () => {
		expect(quantize(2.34, 0.1)).toBe(2.3);
		expect(quantize(2.36, 0.1)).toBe(2.4);
		expect(quantize(2.4, 0.25)).toBe(2.5);
	});

	it('sheds binary-float noise, so a drag never emits 2.9000000000000004', () => {
		// 29 * 0.1 is 2.9000000000000004 in IEEE 754.
		expect(quantize(29 * 0.1, 0.1)).toBe(2.9);
		expect(String(quantize(0.1 + 0.2, 0.1))).toBe('0.3');
	});
});

describe('toBounds', () => {
	it('maps a handle at an outer edge to null, not the boundary number', () => {
		expect(toBounds(1, 3.4, WEIGHT, 0.1)).toEqual({ min: null, max: 3.4 });
		expect(toBounds(1.9, 5, WEIGHT, 0.1)).toEqual({ min: 1.9, max: null });
	});

	it('maps a full-width range to no filter at all', () => {
		// Otherwise the rail would show two chips and compile a WHERE that excludes nothing.
		expect(toBounds(1, 5, WEIGHT, 0.1)).toEqual({ min: null, max: null });
	});

	it('keeps interior bounds', () => {
		expect(toBounds(1.9, 3.4, WEIGHT, 0.1)).toEqual({ min: 1.9, max: 3.4 });
	});

	it('orders crossed handles rather than trusting the caller', () => {
		expect(toBounds(3.4, 1.9, WEIGHT, 0.1)).toEqual({ min: 1.9, max: 3.4 });
	});

	it('clamps out-of-domain input', () => {
		expect(toBounds(-3, 99, WEIGHT, 0.1)).toEqual({ min: null, max: null });
		expect(toBounds(0.5, 4, WEIGHT, 0.1)).toEqual({ min: null, max: 4 });
	});

	it('quantizes what it emits', () => {
		expect(toBounds(2.34, 3.36, WEIGHT, 0.1)).toEqual({ min: 2.3, max: 3.4 });
	});
});

describe('toHandles', () => {
	it('parks nulls at the domain edges', () => {
		expect(toHandles(null, null, WEIGHT)).toEqual({ lo: 1, hi: 5 });
		expect(toHandles(null, 3.4, WEIGHT)).toEqual({ lo: 1, hi: 3.4 });
		expect(toHandles(1.9, null, WEIGHT)).toEqual({ lo: 1.9, hi: 5 });
	});

	it('round-trips an interior range through toBounds', () => {
		const h = toHandles(1.9, 3.4, WEIGHT);
		expect(toBounds(h.lo, h.hi, WEIGHT, 0.1)).toEqual({ min: 1.9, max: 3.4 });
	});

	it('round-trips one-sided and unbounded ranges', () => {
		for (const [min, max] of [
			[null, 3.4],
			[1.9, null],
			[null, null]
		] as const) {
			const h = toHandles(min, max, WEIGHT);
			expect(toBounds(h.lo, h.hi, WEIGHT, 0.1)).toEqual({ min, max });
		}
	});

	it('clamps a hand-written URL that exceeds the domain', () => {
		expect(toHandles(-5, 12, WEIGHT)).toEqual({ lo: 1, hi: 5 });
	});

	it('untangles a hand-written URL where min exceeds max', () => {
		// ?wmin=4&wmax=2 — show an ordered slider rather than crossed handles.
		expect(toHandles(4, 2, WEIGHT)).toEqual({ lo: 2, hi: 4 });
	});
});

describe('rangeLabel', () => {
	const oneDp = (n: number) => n.toFixed(1);

	it('is empty when nothing is bounded', () => {
		expect(rangeLabel(null, null, oneDp)).toBe('');
	});

	it('reads one-sided ranges as open', () => {
		expect(rangeLabel(null, 3.4, oneDp)).toBe('up to 3.4');
		expect(rangeLabel(1.9, null, oneDp)).toBe('1.9+');
	});

	it('reads a two-sided range as a span', () => {
		expect(rangeLabel(1.9, 3.4, oneDp)).toBe('1.9 – 3.4');
	});

	it('collapses an equal pair to one value', () => {
		expect(rangeLabel(3, 3, oneDp)).toBe('3.0');
	});

	it('defaults to String when no formatter is given', () => {
		expect(rangeLabel(2, 4)).toBe('2 – 4');
	});
});
