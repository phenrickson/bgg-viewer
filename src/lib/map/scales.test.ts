import { describe, it, expect } from 'vitest';
import {
	radiusFor,
	parseOklch,
	oklchMix,
	buildColouring,
	withDimmed,
	toContext,
	DIM_CHROMA,
	LIT_ALPHA,
	CONTEXT_ALPHA,
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
	const CTX = 'oklch(0.86 0.006 260)';

	it('moves unlit points into a dimmed copy of the palette', () => {
		const c = withDimmed(colouring(), Uint8Array.from([1, 0, 1, 0]), CTX);
		// Lit points keep their bucket; unlit shift by the palette length.
		expect(Array.from(c.bucketOf)).toEqual([0, 1 + 3, 2, 1 + 3]);
		expect(c.colours).toHaveLength(6);
	});

	it('leaves the lit half of the palette byte-identical', () => {
		const base = colouring();
		const c = withDimmed(base, Uint8Array.from([1, 0, 1, 0]), CTX);
		expect(c.colours.slice(0, 3)).toEqual(base.colours);
	});

	it('every dimmed bucket resolves to a real colour — no index past the palette', () => {
		const c = withDimmed(colouring(), Uint8Array.from([0, 0, 0, 0]), CTX);
		for (const b of c.bucketOf) {
			expect(c.colours[b]).toBeDefined();
		}
	});

	it('costs nothing when everything is lit — the map’s resting state', () => {
		const base = colouring();
		const c = withDimmed(base, Uint8Array.from([1, 1, 1, 1]), CTX);
		expect(c).toBe(base);
	});

	it('is a no-op without a mask', () => {
		const base = colouring();
		expect(withDimmed(base, null, CTX)).toBe(base);
	});

	it('keeps the legend describing the LIT colours only', () => {
		// A dimmed bucket is never a legend entry — the legend says what a colour means, and
		// "dimmed blue" is not a category.
		const base = colouring();
		const c = withDimmed(base, Uint8Array.from([1, 0, 1, 0]), CTX);
		expect(c.legend).toEqual(base.legend);
		for (const { bucket } of c.legend) expect(bucket).toBeLessThan(base.colours.length);
	});
});

describe('toContext — scenery gives up its hue, not its visibility', () => {
	const CTX_LIGHT = 'oklch(0.86 0.006 260)';
	const CTX_DARK = 'oklch(0.28 0.006 260)';
	const BG_LIGHT = 'oklch(0.99 0.004 80)';
	const BG_DARK = 'oklch(0.19 0.02 260)';

	// Separation as the eye sees it: lightness plus chroma projected to oklab a/b.
	const lab = ([L, C, H]: [number, number, number]) => [
		L,
		C * Math.cos((H * Math.PI) / 180),
		C * Math.sin((H * Math.PI) / 180)
	];
	const dE = (p: string, q: string) => {
		const a = lab(parseOklch(p)!);
		const b = lab(parseOklch(q)!);
		return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
	};

	it('takes the context LIGHTNESS, so a pale colour cannot fade to nothing', () => {
		// This is the whole correction. Mixing a fraction toward the background faded
		// --map-ramp-lo (the pale end of the default weight ramp) to ΔE 0.013 from the page in
		// light mode — every light game silently dropped out of the landscape.
		const paleEnd = 'oklch(0.78 0.09 250)';
		const darkEnd = 'oklch(0.42 0.16 250)';
		expect(parseOklch(toContext(paleEnd, CTX_LIGHT))![0]).toBeCloseTo(0.86, 2);
		expect(parseOklch(toContext(darkEnd, CTX_LIGHT))![0]).toBeCloseTo(0.86, 2);
	});

	it('keeps every dimmed colour visible against the page, in BOTH themes', () => {
		for (const [ctx, bg, ramp] of [
			[CTX_LIGHT, BG_LIGHT, ['oklch(0.78 0.09 250)', 'oklch(0.42 0.16 250)']],
			[CTX_DARK, BG_DARK, ['oklch(0.44 0.05 250)', 'oklch(0.86 0.13 250)']]
		] as const) {
			for (const c of ramp) {
				expect(dE(toContext(c, ctx), bg)).toBeGreaterThan(0.08);
			}
		}
	});

	it('keeps every LIT colour distinguishable from scenery, in both themes', () => {
		for (const [ctx, ramp] of [
			[CTX_LIGHT, ['oklch(0.78 0.09 250)', 'oklch(0.42 0.16 250)', 'oklch(0.62 0.14 250)']],
			[CTX_DARK, ['oklch(0.44 0.05 250)', 'oklch(0.86 0.13 250)', 'oklch(0.62 0.14 250)']]
		] as const) {
			for (const c of ramp) {
				expect(dE(c, toContext(c, ctx))).toBeGreaterThan(0.08);
			}
		}
	});

	it('retains a trace of the original hue, so continents stay legible as continents', () => {
		const out = parseOklch(toContext('oklch(0.62 0.14 250)', CTX_LIGHT))!;
		expect(out[2]).toBeCloseTo(250, 0);
		expect(out[1]).toBeGreaterThan(0);
		expect(out[1]).toBeLessThan(0.14 * 0.5);
		expect(out[1]).toBeCloseTo(0.14 * DIM_CHROMA, 3);
	});

	it('gives every dimmed colour the SAME lightness — scenery is one surface', () => {
		const a = parseOklch(toContext('oklch(0.42 0.16 250)', CTX_LIGHT))![0];
		const b = parseOklch(toContext('oklch(0.78 0.09 250)', CTX_LIGHT))![0];
		expect(a).toBeCloseTo(b, 5);
	});

	it('falls back to color-mix for a non-oklch colour (the --map-cat hexes)', () => {
		const out = toContext('#0072b2', CTX_LIGHT);
		expect(out).toContain('color-mix(in oklch');
		expect(out).toContain('#0072b2');
	});
});

describe('per-bucket alpha — colour alone could not carry the highlight', () => {
	const colouring = () => ({
		bucketOf: Uint8Array.from([0, 1, 2, 1]),
		colours: ['oklch(0.5 0.1 250)', 'oklch(0.7 0.15 45)', 'oklch(0.6 0.12 150)'],
		legend: []
	});
	const CTX = 'oklch(0.86 0.006 260)';

	it('emits one alpha per bucket, aligned to the palette', () => {
		const c = withDimmed(colouring(), Uint8Array.from([1, 0, 1, 0]), CTX);
		expect(c.alpha).toHaveLength(c.colours.length);
	});

	it('lit buckets are near-solid and context buckets far more transparent', () => {
		const c = withDimmed(colouring(), Uint8Array.from([1, 0, 1, 0]), CTX);
		const n = 3;
		expect(c.alpha!.slice(0, n).every((a) => a === LIT_ALPHA)).toBe(true);
		expect(c.alpha!.slice(n).every((a) => a === CONTEXT_ALPHA)).toBe(true);
		// A clear gap, but deliberately NOT an extreme one. An earlier cut used 0.1 and the
		// landscape became invisible — which loses the point of drawing it, since "where does
		// my set sit in the whole of board games" is the question only this map answers.
		// Keeping the lit set in front is `PointCanvas`'s draw order (context first, lit
		// last), not a bigger alpha ratio; alpha only has to make the two groups legible.
		expect(LIT_ALPHA - CONTEXT_ALPHA).toBeGreaterThan(0.4);
		// Context must stay genuinely visible: a single dot, and a pile of them, both readable.
		expect(CONTEXT_ALPHA).toBeGreaterThanOrEqual(0.2);
	});

	it('every point indexes an alpha that exists', () => {
		const c = withDimmed(colouring(), Uint8Array.from([0, 0, 0, 0]), CTX);
		for (const b of c.bucketOf) expect(c.alpha![b]).toBeGreaterThan(0);
	});

	it('carries no alpha when nothing is dimmed, so the resting map keeps one global alpha', () => {
		expect(withDimmed(colouring(), Uint8Array.from([1, 1, 1, 1]), CTX).alpha).toBeUndefined();
		expect(withDimmed(colouring(), null, CTX).alpha).toBeUndefined();
	});
});
