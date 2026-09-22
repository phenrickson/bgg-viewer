import { describe, it, expect } from 'vitest';
import { buildEgoNetwork, topK, type NetworkData } from './network';

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
