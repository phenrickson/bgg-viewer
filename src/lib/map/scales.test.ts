import { describe, it, expect } from 'vitest';
import {
	radiusFor,
	parseOklch,
	oklchMix,
	buildColouring,
	withDimmed,
	mixToward,
	DIM_MIX,
	RADIUS_MIN,
	RADIUS_MAX,
	RADIUS_UPCOMING,
	RAMP_STEPS,
	type Palette
} from './scales';
import type { GameFacts } from './facts';

const palette: Palette = {
	chart: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
	ramp: ['oklch(0.9 0.05 250)', 'oklch(0.4 0.15 250)'],
	muted: 'muted',
	other: 'other',
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
		categoryLabels: ['Other', 'Economic', 'B', 'C', 'D', 'E', 'Wargame', 'G'],
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
	// Continuous encodings: bucket 0 is "no value" (muted), 1..RAMP_STEPS span the domain.
	it('weight: 1–5 through the complexity ramp; unknown weight is the muted bucket', () => {
		const c = buildColouring('weight', facts(), palette, 2026);
		expect(c.colours).toHaveLength(RAMP_STEPS + 1);
		expect(c.colours[0]).toBe('muted');
		expect(c.colours[1]).toMatch(/^oklch\(/);
		expect(c.bucketOf[0]).toBe(1);
		expect(c.bucketOf[2]).toBe(RAMP_STEPS);
		expect(c.bucketOf[1]).toBeGreaterThan(1);
		expect(c.bucketOf[3]).toBe(0);
		expect(c.domain).toEqual([1, 5]);
	});
	it('geek / average rating: ramp over their real bands; unrated is the muted bucket', () => {
		// Geek rating: the app's diverging scale — clamped 5–7, pivot 6; 7+ is the top.
		const g = buildColouring('geek', facts({ geekRating: Float32Array.from([5.5, 6, 7.5, 0]) }), palette, 2026);
		expect(g.bucketOf[0]).toBeGreaterThan(0);
		expect(g.bucketOf[2]).toBe(RAMP_STEPS); // 7.5 clamps to the top
		expect(g.bucketOf[3]).toBe(0);
		expect(g.domain).toEqual([5, 7]);
		expect(g.mid).toBe(6);
		expect(g.clamped).toBe(true);
		// rose arm below the pivot, blue arm above
		expect(g.colours[1]).toMatch(/ 25\)$/);
		expect(g.colours[RAMP_STEPS]).toMatch(/ 250\)$/);
		const a = buildColouring('rating', facts(), palette, 2026);
		expect(a.bucketOf[2]).toBe(RAMP_STEPS);
		expect(a.domain).toEqual([5, 9]);
	});
	it('year: clamps old games to the bottom of the ramp', () => {
		const c = buildColouring('year', facts({ year: Int16Array.from([1980, 2010, 2026, 0]) }), palette, 2026);
		expect(c.bucketOf[0]).toBe(1);
		expect(c.bucketOf[2]).toBe(RAMP_STEPS);
		expect(c.bucketOf[3]).toBe(0);
	});
	it('upcoming: two buckets with a legend', () => {
		const c = buildColouring('upcoming', facts(), palette, 2026);
		expect(Array.from(c.bucketOf)).toEqual([0, 0, 1, 1]);
		expect(c.colours).toEqual(['muted', 'accent']);
		expect(c.legend.map((l) => l.bucket)).toEqual([0, 1]);
	});
	it('category: chart tokens for the curated seven, muted for other, other last in the legend', () => {
		const c = buildColouring('category', facts(), palette, 2026);
		expect(c.colours).toEqual(['other', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
		expect(Array.from(c.bucketOf)).toEqual([1, 6, 0, 0]);
		expect(c.legend.at(-1)).toEqual({ label: 'Other', bucket: 0 });
		expect(c.legend[0]).toEqual({ label: 'Economic', bucket: 1 });
	});
});

describe('withDimmed — lighting the scope without a second draw call', () => {
	const colouring = () => ({
		bucketOf: Uint8Array.from([0, 1, 2, 1]),
		colours: ['oklch(0.5 0.1 250)', 'oklch(0.7 0.15 45)', 'oklch(0.6 0.12 150)'],
		legend: [
			{ label: 'a', bucket: 0 },
			{ label: 'b', bucket: 1 }
		]
	});
	const BG = 'oklch(0.99 0.004 80)';

	it('moves unlit points into a dimmed copy of the palette', () => {
		const c = withDimmed(colouring(), Uint8Array.from([1, 0, 1, 0]), BG);
		// Lit points keep their bucket; unlit shift by the palette length.
		expect(Array.from(c.bucketOf)).toEqual([0, 1 + 3, 2, 1 + 3]);
		expect(c.colours).toHaveLength(6);
	});

	it('leaves the lit half of the palette byte-identical', () => {
		const base = colouring();
		const c = withDimmed(base, Uint8Array.from([1, 0, 1, 0]), BG);
		expect(c.colours.slice(0, 3)).toEqual(base.colours);
	});

	it('every dimmed bucket resolves to a real colour — no index past the palette', () => {
		const c = withDimmed(colouring(), Uint8Array.from([0, 0, 0, 0]), BG);
		for (const b of c.bucketOf) {
			expect(c.colours[b]).toBeDefined();
		}
	});

	it('costs nothing when everything is lit — the map’s resting state', () => {
		const base = colouring();
		const c = withDimmed(base, Uint8Array.from([1, 1, 1, 1]), BG);
		expect(c).toBe(base);
	});

	it('is a no-op without a mask', () => {
		const base = colouring();
		expect(withDimmed(base, null, BG)).toBe(base);
	});

	it('keeps the legend describing the LIT colours only', () => {
		// A dimmed bucket is never a legend entry — the legend says what a colour means, and
		// "dimmed blue" is not a category.
		const base = colouring();
		const c = withDimmed(base, Uint8Array.from([1, 0, 1, 0]), BG);
		expect(c.legend).toEqual(base.legend);
		for (const { bucket } of c.legend) expect(bucket).toBeLessThan(base.colours.length);
	});
});

describe('mixToward', () => {
	const BG_LIGHT = 'oklch(0.99 0.004 80)';
	const BG_DARK = 'oklch(0.19 0.02 260)';

	it('t=1 leaves a colour unchanged', () => {
		const c = parseOklch(mixToward('oklch(0.62 0.14 250)', BG_LIGHT, 1))!;
		expect(c[0]).toBeCloseTo(0.62, 2);
		expect(c[1]).toBeCloseTo(0.14, 2);
	});

	it('drops chroma toward the background as it fades', () => {
		const c = parseOklch(mixToward('oklch(0.62 0.14 250)', BG_LIGHT, DIM_MIX))!;
		expect(c[1]).toBeLessThan(0.14 * 0.2);
	});

	it('fades toward the background in BOTH themes, not just light', () => {
		// The lightness has to move toward the surface it sits on, or dimming in dark mode
		// makes points brighter than the ones it is meant to recede behind.
		const onLight = parseOklch(mixToward('oklch(0.62 0.14 250)', BG_LIGHT, DIM_MIX))!;
		expect(onLight[0]).toBeGreaterThan(0.62);
		const onDark = parseOklch(mixToward('oklch(0.62 0.14 250)', BG_DARK, DIM_MIX))!;
		expect(onDark[0]).toBeLessThan(0.62);
	});

	it('fades two different hues by the same visual amount', () => {
		// Perceptual evenness is the point of mixing in oklch: a dimmed blue and a dimmed
		// orange must recede together, or one reads as still-selected.
		const blue = parseOklch(mixToward('oklch(0.62 0.14 250)', BG_LIGHT, DIM_MIX))!;
		const amber = parseOklch(mixToward('oklch(0.62 0.14 75)', BG_LIGHT, DIM_MIX))!;
		expect(Math.abs(blue[0] - amber[0])).toBeLessThan(0.01);
	});

	it('falls back to color-mix for a non-oklch colour (the --map-cat hexes)', () => {
		const out = mixToward('#0072b2', BG_LIGHT, DIM_MIX);
		expect(out).toContain('color-mix(in oklch');
		expect(out).toContain('#0072b2');
	});
});
