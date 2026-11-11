import { describe, it, expect } from 'vitest';
import { buildEgoNetwork, topK, egoParents, egoSimulation, layoutEgoNetwork, type NetworkData } from './network';

// Six unit vectors in 2-d: three clustered near +x, three near +y.
function data(): NetworkData {
	const angles = [0, 0.1, 0.2, 1.4, 1.5, 1.6];
	const emb = new Float32Array(angles.length * 2);
	angles.forEach((a, i) => { emb[i * 2] = Math.cos(a); emb[i * 2 + 1] = Math.sin(a); });
	return { n: angles.length, dim: 2, emb, eligible: () => true };
}

describe('topK', () => {
	it('returns the nearest by cosine, best first, excluding self', () => {
		const got = topK(data(), 0, 2).map((x) => x.i);
		expect(got).toEqual([1, 2]);
	});
	it('honours eligibility', () => {
		const d = { ...data(), eligible: (i: number) => i !== 1 };
		expect(topK(d, 0, 2).map((x) => x.i)).toEqual([2, 3]);
	});
});

describe('buildEgoNetwork', () => {
	it('one hop: source plus its k neighbours, edges among them', () => {
		const g = buildEgoNetwork(data(), 0, { k: 2, hops: 1, mutual: false });
		expect(g.nodes.map((n) => n.i).sort()).toEqual([0, 1, 2]);
		expect(g.nodes.find((n) => n.i === 0)?.hop).toBe(0);
		// 0–1, 0–2 from the source; 1–2 because they list each other.
		expect(g.edges.length).toBe(3);
		expect(g.edges.every((e) => e.mutual)).toBe(true);
	});
	it('two hops reach across the gap; mutual drops one-way edges', () => {
		const d = data();
		// With k=3 the source's third neighbour is 3, across the gap; 3 brings in 4 and 5 as
		// hop 2. Node 4 lists 2 among its three, but 2 doesn't list 4 back — a one-way edge.
		const loose = buildEgoNetwork(d, 0, { k: 3, hops: 2, mutual: false });
		expect(loose.nodes.some((n) => n.i === 4 && n.hop === 2)).toBe(true);
		expect(loose.edges.some((e) => !e.mutual)).toBe(true);
		const strict = buildEgoNetwork(d, 0, { k: 3, hops: 2, mutual: true });
		expect(strict.edges.every((e) => e.mutual)).toBe(true);
		expect(strict.edges.length).toBeLessThan(loose.edges.length);
	});
});

describe('buildEgoNetwork floor', () => {
	it('links only neighbours at or above the floor', () => {
		// 0's near cluster (1, 2) is within cos(0.2) ≈ 0.98; the far one (3–5) is under 0.2.
		const g = buildEgoNetwork(data(), 0, { k: 5, hops: 1, mutual: false, floor: 0.9 });
		expect(g.nodes.map((n) => n.i).sort()).toEqual([0, 1, 2]);
		expect(g.edges.every((e) => e.sim >= 0.9)).toBe(true);
	});
	it('a floor above everything leaves the centre alone', () => {
		const g = buildEgoNetwork(data(), 0, { k: 5, hops: 2, mutual: false, floor: 0.999 });
		expect(g.nodes.map((n) => n.i)).toEqual([0]);
	});
});

describe('egoParents', () => {
	it('hangs each game off its most similar neighbour one ring in; the source off nothing', () => {
		const g = buildEgoNetwork(data(), 0, { k: 3, hops: 2, mutual: false });
		const parents = egoParents(g);
		expect(parents.get(0)).toBe(-1);
		const hop = new Map(g.nodes.map((n) => [n.i, n.hop]));
		for (const n of g.nodes) {
			if (n.i === 0) continue;
			expect(hop.get(parents.get(n.i)!)).toBe(n.hop - 1);
		}
	});
});

describe('layoutEgoNetwork hold', () => {
	it('keeps the games that stay exactly where they were; new ones start beside their parent', () => {
		const d = data();
		const g0 = buildEgoNetwork(d, 0, { k: 2, hops: 1, mutual: false });
		const l0 = layoutEgoNetwork(g0, () => 5);
		const seed = new Map(g0.nodes.map((n, j) => [n.i, [l0.px[j], l0.py[j]] as [number, number]]));
		const g1 = buildEgoNetwork(d, 0, { k: 4, hops: 1, mutual: false });
		const l1 = layoutEgoNetwork(g1, () => 5, seed, true);
		const at1 = new Map(g1.nodes.map((n, j) => [n.i, [l1.px[j], l1.py[j]]]));
		for (const [i, p] of seed) expect(at1.get(i)).toEqual([p[0] - seed.get(0)![0], p[1] - seed.get(0)![1]]);
		expect(g1.nodes.length).toBeGreaterThan(g0.nodes.length);
	});
});

describe('layoutEgoNetwork seed', () => {
	it('starts seeded games where they were, shifted so the centre is at the origin', () => {
		const g = buildEgoNetwork(data(), 0, { k: 2, hops: 1, mutual: false });
		const seed = new Map<number, [number, number]>([[0, [100, 100]], [1, [160, 100]], [2, [100, 40]]]);
		const { nodes } = egoSimulation(g, () => 5, seed);
		const at = new Map(nodes.map((n) => [n.i, [n.x, n.y]]));
		expect(at.get(0)).toEqual([0, 0]);
		expect(at.get(1)).toEqual([60, 0]);
		expect(at.get(2)).toEqual([0, -60]);
	});
	it('a seeded layout keeps games near where they were', () => {
		const g = buildEgoNetwork(data(), 0, { k: 3, hops: 2, mutual: false });
		const first = layoutEgoNetwork(g);
		const seed = new Map(g.nodes.map((n, j) => [n.i, [first.px[j], first.py[j]] as [number, number]]));
		const again = layoutEgoNetwork(g, () => 5, seed);
		for (let j = 0; j < g.nodes.length; j++) {
			expect(Math.hypot(again.px[j] - first.px[j], again.py[j] - first.py[j])).toBeLessThan(40);
		}
	});
});
