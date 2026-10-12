import { describe, it, expect } from 'vitest';
import { layoutGenealogy, ndcToScreenY, badgeCentre, dashed, offset } from './genealogy-layout';
import type { Genealogy, GenealogyNode } from './genealogy';

const node = (i: number, side: GenealogyNode['side'], gen: number, via: number): GenealogyNode =>
	({ i, side, gen, via, sim: 0.9, kind: 'influence', unfolded: false, hidden: 0 });
const tree = (nodes: GenealogyNode[]): Genealogy =>
	({ centre: 0, placeable: true, nodes, centreHidden: { up: 0, down: 0, same: 0 } });

// 0 centre 2013; 1,2 parents (2007, 2010); 3 grandparent via 1 (2005);
// 4,5 children (2016, 2019); 6 same year (2013); 7 same year (2013)
const year = Int16Array.from([2013, 2007, 2010, 2005, 2016, 2019, 2013, 2013]);
const g = tree([
	node(0, 'centre', 0, -1), node(1, 'up', -1, 0), node(2, 'up', -1, 0), node(3, 'up', -2, 1),
	node(4, 'down', 1, 0), node(5, 'down', 1, 0), node(6, 'same', 0, 0), node(7, 'same', 0, 0)
]);
const j = (i: number) => g.nodes.findIndex((n) => n.i === i);

describe('layoutGenealogy', () => {
	it('generation mode: ancestors above, descendants below, one row per generation', () => {
		const l = layoutGenealogy(g, year, 'gen');
		expect(l.y[j(1)]).toBeGreaterThan(l.y[j(0)]);
		expect(l.y[j(1)]).toBeCloseTo(l.y[j(2)]);
		expect(l.y[j(3)]).toBeGreaterThan(l.y[j(1)]);
		expect(l.y[j(4)]).toBeLessThan(l.y[j(0)]);
		expect(l.y[j(4)]).toBeCloseTo(l.y[j(5)]);
		expect(l.ticks.map((t) => t.label)).toEqual(['−2', '−1', '0', '+1']);
	});
	it('year mode: y is proportional to the year gap', () => {
		const l = layoutGenealogy(g, year, 'year');
		const per = (l.y[j(1)] - l.y[j(0)]) / 6; // 2007 is 6 years before 2013
		expect(l.y[j(2)] - l.y[j(0)]).toBeCloseTo(per * 3);
		expect(l.y[j(5)] - l.y[j(0)]).toBeCloseTo(per * -6);
	});
	it('puts a parent above the middle of its children', () => {
		const l = layoutGenealogy(g, year, 'gen');
		// down half: 4 and 5 are the centre's children, centred under it
		expect((l.x[j(4)] + l.x[j(5)]) / 2).toBeCloseTo(l.x[j(0)]);
		expect(l.x[j(4)]).not.toBeCloseTo(l.x[j(5)]);
	});
	it("puts same-year games on the centre's row, either side, two slots out for their labels", () => {
		const l = layoutGenealogy(g, year, 'year');
		expect(l.y[j(6)]).toBeCloseTo(l.y[j(0)]);
		expect(Math.sign(l.x[j(6)] - l.x[j(0)])).toBe(-Math.sign(l.x[j(7)] - l.x[j(0)]));
		const slot = Math.abs(l.x[j(4)] - l.x[j(5)]); // 4 and 5 are adjacent leaves
		expect(Math.abs(l.x[j(6)] - l.x[j(0)])).toBeCloseTo(2 * slot);
	});
	it('fits within [-0.9, 0.9] and handles a lone centre without NaN', () => {
		const l = layoutGenealogy(g, year, 'year');
		for (const v of [...l.x, ...l.y]) expect(Math.abs(v)).toBeLessThanOrEqual(0.9 + 1e-6);
		const lone = layoutGenealogy(tree([node(0, 'centre', 0, -1)]), year, 'year');
		expect([lone.x[0], lone.y[0]]).toEqual([0, 0]);
	});
});

describe('layoutGenealogy with a BC ancestor', () => {
	// Go (−2200) under a 1990 centre: a 4,190-year span must not crush the tree into a line
	// or draw hundreds of ticks.
	const bcYear = Int16Array.from([1990, -2200, 1985, 1995, 1998]);
	const bc = tree([node(0, 'centre', 0, -1), node(1, 'up', -1, 0), node(2, 'up', -1, 0), node(3, 'down', 1, 0), node(4, 'down', 1, 0)]);
	it('keeps the tree spread across', () => {
		const l = layoutGenealogy(bc, bcYear, 'year');
		expect(Math.max(...l.x) - Math.min(...l.x)).toBeGreaterThan(0.2);
	});
	it('keeps the year ticks to a readable number', () => {
		const l = layoutGenealogy(bc, bcYear, 'year');
		expect(l.ticks.length).toBeGreaterThanOrEqual(2);
		expect(l.ticks.length).toBeLessThanOrEqual(12);
	});
});

describe('geometry', () => {
	it('ndcToScreenY recovers the y map alone (screen y runs down), whatever x does', () => {
		const f = ndcToScreenY({ y: 0, py: 100 }, { y: 0.5, py: 50 })!;
		expect(f(-0.5)).toBe(150);
		expect(ndcToScreenY({ y: 0.2, py: 1 }, { y: 0.2, py: 9 })).toBeNull();
	});
	it('badgeCentre finds the badge token at the end of the last label line', () => {
		const measure = (t: string) => t.length * 10;
		const m = { lineHeight: 14, padX: 4, padY: 2 };
		const box = { bx: 100, by: 40, lines: ['Resurgence', '(2022) ⊕54'] };
		// last line is 100px wide; the 3-char token is its final 30px → centre 15px in from the end
		expect(badgeCentre(box, measure, '⊕54', m)).toEqual([100 + 4 + 100 - 15, 40 + 2 + 14 * 1.5]);
	});
	it('dashed cuts a line into on/off runs', () => {
		const ds = dashed([[0, 0], [1, 0]], 0.2, 0.1);
		expect(ds).toHaveLength(4);
		const drawn = ds.reduce((s, d) => s + (d[d.length - 1][0] - d[0][0]), 0);
		expect(drawn).toBeCloseTo(0.7);
	});
	it('offset moves a line sideways along its left normal', () => {
		expect(offset([[0, 0], [1, 0]], 0.1)).toEqual([[0, 0.1], [1, 0.1]]);
	});
});
