import { describe, it, expect } from 'vitest';
import {
	jitter,
	pcaProjection,
	umapProjection,
	stripProjection,
	projectionFor,
	factProjection,
	toNdc,
	type Projection
} from './projection';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import { DEFAULT_VIEW, type ViewState } from './view';

function coords(n: number, k = 3): CoordinateSet {
	const ids = Int32Array.from({ length: n }, (_, i) => (i + 1) * 10);
	return {
		ids,
		pcs: Array.from({ length: k }, (_, c) => Float32Array.from({ length: n }, (_, i) => i + c * 100)),
		umap: [
			Float32Array.from({ length: n }, (_, i) => i * 2),
			Float32Array.from({ length: n }, (_, i) => i * 3)
		],
		k,
		model: 'm',
		version: 1,
		index: new Map(Array.from(ids).map((id, i) => [id, i]))
	};
}

const view = (o: Partial<ViewState> = {}): ViewState => ({ ...DEFAULT_VIEW, ...o });

describe('jitter', () => {
	it('is deterministic — a game sits in the same place every visit', () => {
		expect(jitter(12345)).toBe(jitter(12345));
	});

	it('stays inside the band it claims', () => {
		for (let id = 1; id < 3000; id += 7) {
			expect(Math.abs(jitter(id))).toBeLessThanOrEqual(1.6);
		}
	});

	it('spreads different games apart', () => {
		const vals = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(jitter));
		expect(vals.size).toBe(8);
	});
});

describe('producers', () => {
	it('pca picks the requested 1-based components and names both axes', () => {
		const c = coords(4);
		const p = pcaProjection(c, 1, 3);
		expect(Array.from(p.x)).toEqual(Array.from(c.pcs[0]));
		expect(Array.from(p.y)).toEqual(Array.from(c.pcs[2]));
		expect(p.xLabel).toBe('Component 1');
		expect(p.yLabel).toBe('Component 3');
		expect(p.isometric).toBe(true);
		expect(p.band).toBe(false);
	});

	it('pca degrades to zeros for a component the artifact lacks, rather than throwing', () => {
		const p = pcaProjection(coords(4, 2), 1, 9);
		expect(Array.from(p.y)).toEqual([0, 0, 0, 0]);
	});

	it('umap is isometric — it is a map of a space, so distances must not distort', () => {
		const p = umapProjection(coords(3));
		expect(p.isometric).toBe(true);
		expect(p.xLabel).toBe('UMAP 1');
	});

	it('strip is a band with no y meaning, jittered per game id', () => {
		const c = coords(5);
		const p = stripProjection(c, 2);
		expect(Array.from(p.x)).toEqual(Array.from(c.pcs[1]));
		expect(p.yLabel).toBeNull();
		expect(p.band).toBe(true);
		expect(p.y[0]).toBeCloseTo(jitter(c.ids[0]), 5);
	});

	it('projectionFor routes each view choice to its producer', () => {
		const c = coords(4);
		expect(projectionFor(c, view({ projection: 'umap' })).xLabel).toBe('UMAP 1');
		expect(projectionFor(c, view({ projection: 'strip', x: 2 })).band).toBe(true);
		expect(projectionFor(c, view({ projection: 'pca', x: 1, y: 2 })).yLabel).toBe('Component 2');
	});
});

describe('toNdc', () => {
	const mk = (xs: number[], ys: number[], o: Partial<Projection> = {}): Projection => ({
		x: Float32Array.from(xs),
		y: Float32Array.from(ys),
		xLabel: 'x',
		yLabel: 'y',
		isometric: true,
		band: false,
		...o
	});

	it('centres the data and fits it inside [-1, 1]', () => {
		const { nx, ny } = toNdc(mk([0, 10], [0, 10]));
		expect(nx[0]).toBeCloseTo(-0.95, 5);
		expect(nx[1]).toBeCloseTo(0.95, 5);
		expect(ny[0]).toBeCloseTo(-0.95, 5);
		expect(ny[1]).toBeCloseTo(0.95, 5);
	});

	it('isometric: ONE scale on both axes, so a narrow axis stays narrow', () => {
		// x spans 10, y spans 1. Isometric must NOT stretch y to fill the square.
		const { nx, ny } = toNdc(mk([0, 10], [0, 1]));
		expect(nx[1] - nx[0]).toBeCloseTo(1.9, 5);
		expect(ny[1] - ny[0]).toBeCloseTo(0.19, 5);
	});

	it('non-isometric: each axis fills its own range, so neither is wasted', () => {
		const { nx, ny } = toNdc(mk([0, 10], [0, 1], { isometric: false }));
		expect(nx[1] - nx[0]).toBeCloseTo(1.9, 5);
		expect(ny[1] - ny[0]).toBeCloseTo(1.9, 5);
	});

	it('band: x fills the range, y is a narrow jitter band around the offset', () => {
		const { nx, ny } = toNdc(mk([0, 10], [-1, 1], { band: true, isometric: false }));
		expect(nx[1] - nx[0]).toBeCloseTo(1.9, 5);
		expect(ny[0]).toBeCloseTo(-0.22, 5);
		expect(ny[1]).toBeCloseTo(0.22, 5);
	});

	it('band offset shifts the band without changing its width', () => {
		const { ny } = toNdc(mk([0, 10], [-1, 1], { band: true, isometric: false }), undefined, 0.5);
		expect(ny[0]).toBeCloseTo(0.28, 5);
		expect(ny[1]).toBeCloseTo(0.72, 5);
	});

	it('measures the extent only over `include`, but still positions everything', () => {
		// The strip's real problem: an upcoming game far outside the rated shape must not be
		// allowed to squash the rest into the middle — but it still has to land somewhere.
		const p = mk([0, 10, 1000], [0, 10, 1000]);
		const { nx } = toNdc(p, (i) => i < 2);
		expect(nx[0]).toBeCloseTo(-0.95, 5);
		expect(nx[1]).toBeCloseTo(0.95, 5);
		expect(nx[2]).toBeGreaterThan(1); // positioned, off-square, not clamped or dropped
	});

	it('ignores non-finite values when measuring the extent', () => {
		const { nx } = toNdc(mk([0, 10, NaN], [0, 10, NaN]));
		expect(nx[0]).toBeCloseTo(-0.95, 5);
		expect(nx[1]).toBeCloseTo(0.95, 5);
	});

	it('emits zeros rather than NaN when nothing is finite', () => {
		const { nx, ny } = toNdc(mk([NaN, NaN], [NaN, NaN]));
		expect(Array.from(nx)).toEqual([0, 0]);
		expect(Array.from(ny)).toEqual([0, 0]);
	});

	it('survives a degenerate extent (every point identical) without dividing by zero', () => {
		const { nx, ny } = toNdc(mk([5, 5, 5], [5, 5, 5]));
		expect([...nx, ...ny].every(Number.isFinite)).toBe(true);
	});
});

describe('factProjection — the seam is general, not just asserted to be', () => {
	const facts = {
		weight: Float32Array.from([1.5, 3.5, 0]),
		averageRating: Float32Array.from([7, 8, 0]),
		geekRating: Float32Array.from([6, 7.5, 0]),
		year: Int16Array.from([1995, 2020, 0]),
		usersRated: Int32Array.from([100, 10000, 0])
	} as unknown as GameFacts;

	it('plots two catalog columns with named axes', () => {
		const p = factProjection(facts, 'weight', 'rating');
		expect(p.x[0]).toBeCloseTo(1.5);
		expect(p.y[1]).toBeCloseTo(8);
		expect(p.xLabel).toBe('Complexity');
		expect(p.yLabel).toBe('Average rating');
	});

	it('is NOT isometric — two different units share no scale', () => {
		expect(factProjection(facts, 'weight', 'year').isometric).toBe(false);
	});

	it('turns "no value" 0 into NaN, so a game with no weight is undrawn, not drawn at 0', () => {
		// 0 is a real position on the weight axis; an unrated game must not land there.
		const p = factProjection(facts, 'weight', 'rating');
		expect(Number.isNaN(p.x[2])).toBe(true);
		expect(Number.isNaN(p.y[2])).toBe(true);
	});

	it('takes the log of a heavily skewed count so the axis is readable', () => {
		const p = factProjection(facts, 'ratings', 'rating');
		expect(p.x[0]).toBeCloseTo(2);
		expect(p.x[1]).toBeCloseTo(4);
	});
});

describe('factProjection jitter', () => {
	const facts = {
		weight: Float32Array.from([2, 3, 4]),
		geekRating: Float32Array.from([7, 8, 6]),
		averageRating: Float32Array.from([7, 8, 6]),
		year: Int16Array.from([2010, 2010, 2010]),
		usersRated: Int32Array.from([100, 200, 300]),
		upcoming: Uint8Array.from([0, 0, 0]),
		category: Uint8Array.from([0, 0, 0]),
		categoryLabels: ['Other'],
		missing: 0,
		name: () => 'x'
	} as unknown as Parameters<typeof factProjection>[0];
	const ids = Int32Array.from([11, 22, 33]);

	it('spreads a year axis so one year is not a single line', () => {
		const p = factProjection(facts, 'year', 'geek', ids);
		expect(new Set(Array.from(p.x)).size).toBe(3);
		// Never far enough to be shown under a neighbouring year.
		for (const v of p.x) expect(Math.abs(v - 2010)).toBeLessThan(0.5);
	});

	it('is deterministic — a game sits in the same place every time', () => {
		const a = factProjection(facts, 'year', 'geek', ids);
		const b = factProjection(facts, 'year', 'geek', ids);
		expect(Array.from(a.x)).toEqual(Array.from(b.x));
	});

	it('leaves continuous axes alone', () => {
		const p = factProjection(facts, 'weight', 'geek', ids);
		expect(Array.from(p.x)).toEqual([2, 3, 4]);
		expect(Array.from(p.y)).toEqual([7, 8, 6]);
	});

	it('without ids there is no jitter, and a year is a line', () => {
		const p = factProjection(facts, 'year', 'geek');
		expect(new Set(Array.from(p.x)).size).toBe(1);
	});
});
