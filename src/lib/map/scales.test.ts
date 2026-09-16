import { describe, it, expect } from 'vitest';
import {
	radiusFor,
	parseOklch,
	oklchMix,
	buildColouring,
	RADIUS_MIN,
	RADIUS_MAX,
	RADIUS_UPCOMING,
	RAMP_STEPS,
	type Palette
} from './scales';
import type { GameFacts } from './facts';

const palette: Palette = {
	chart: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
	ramp: ['oklch(0.9 0.05 250)', 'oklch(0.4 0.15 250)'],
	muted: 'muted',
	accent: 'accent'
};

function facts(over: Partial<GameFacts> = {}): GameFacts {
	return {
		weight: Float32Array.from([1, 3, 5, 0]),
		geekRating: Float32Array.from([5.5, 7, 8.5, 0]),
		averageRating: Float32Array.from([5, 7, 9, 0]),
		year: Int16Array.from([1995, 2010, 2026, 0]),
		usersRated: Int32Array.from([30, 1000, 100000, 0]),
		upcoming: Uint8Array.from([0, 0, 1, 1]),
		category: Uint8Array.from([1, 6, 0, 0]),
		categoryLabels: ['Other', 'Economic', 'B', 'C', 'D', 'E', 'Wargame'],
		missing: 0,
		name: (id) => String(id),
		...over
	};
}

describe('radiusFor', () => {
	it('grows with log popularity between the floor and cap', () => {
		expect(radiusFor(30, false)).toBeCloseTo(RADIUS_MIN);
		expect(radiusFor(100_000, false)).toBeCloseTo(RADIUS_MAX);
		expect(radiusFor(1_000_000, false)).toBeCloseTo(RADIUS_MAX);
		const mid = radiusFor(1000, false);
		expect(mid).toBeGreaterThan(RADIUS_MIN);
		expect(mid).toBeLessThan(RADIUS_MAX);
	});
	it('uniform mode ignores popularity', () => {
		expect(radiusFor(30, false, true)).toBe(radiusFor(100_000, false, true));
	});
	it('gives upcoming games a fixed small radius regardless of ratings', () => {
		expect(radiusFor(50_000, true)).toBe(RADIUS_UPCOMING);
	});
});

describe('oklch', () => {
	it('parses the token forms app.css uses', () => {
		expect(parseOklch('oklch(0.62 0.14 250)')).toEqual([0.62, 0.14, 250]);
		expect(parseOklch('oklch(62% 0.14 250 / 0.5)')).toEqual([0.62, 0.14, 250]);
		expect(parseOklch('#fff')).toBeNull();
	});
	it('mixes endpoints and takes the short way round the hue circle', () => {
		expect(oklchMix('oklch(0.9 0.05 250)', 'oklch(0.4 0.15 250)', 0.5)).toBe('oklch(0.650 0.100 250.0)');
		expect(oklchMix('oklch(0.5 0.1 350)', 'oklch(0.5 0.1 10)', 0.5)).toBe('oklch(0.500 0.100 0.0)');
	});
});

describe('buildColouring', () => {
	it('weight: quantises 1–5 into the ramp, unknown weight to the lightest', () => {
		const c = buildColouring('weight', facts(), palette, 2026);
		expect(c.colours).toHaveLength(RAMP_STEPS);
		expect(c.bucketOf[0]).toBe(0);
		expect(c.bucketOf[2]).toBe(RAMP_STEPS - 1);
		expect(c.bucketOf[1]).toBeGreaterThan(0);
		expect(c.bucketOf[3]).toBe(0);
		expect(c.domain).toEqual([1, 5]);
	});
	it('geek / average rating: ramps over their real bands, unrated to the lightest', () => {
		const g = buildColouring('geek', facts(), palette, 2026);
		expect(g.bucketOf[0]).toBe(0);
		expect(g.bucketOf[2]).toBe(RAMP_STEPS - 1);
		expect(g.bucketOf[3]).toBe(0);
		expect(g.domain).toEqual([5.5, 8.5]);
		const a = buildColouring('rating', facts(), palette, 2026);
		expect(a.bucketOf[2]).toBe(RAMP_STEPS - 1);
		expect(a.domain).toEqual([5, 9]);
	});
	it('year: clamps old games to the bottom of the ramp', () => {
		const c = buildColouring('year', facts({ year: Int16Array.from([1980, 2010, 2026, 0]) }), palette, 2026);
		expect(c.bucketOf[0]).toBe(0);
		expect(c.bucketOf[2]).toBe(RAMP_STEPS - 1);
	});
	it('upcoming: two buckets with a legend', () => {
		const c = buildColouring('upcoming', facts(), palette, 2026);
		expect(Array.from(c.bucketOf)).toEqual([0, 0, 1, 1]);
		expect(c.colours).toEqual(['muted', 'accent']);
		expect(c.legend.map((l) => l.bucket)).toEqual([0, 1]);
	});
	it('category: chart tokens for the top six, muted for other, other last in the legend', () => {
		const c = buildColouring('category', facts(), palette, 2026);
		expect(c.colours).toEqual(['muted', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
		expect(Array.from(c.bucketOf)).toEqual([1, 6, 0, 0]);
		expect(c.legend.at(-1)).toEqual({ label: 'Other', bucket: 0 });
		expect(c.legend[0]).toEqual({ label: 'Economic', bucket: 1 });
	});
});
