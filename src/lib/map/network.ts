/**
 * Ego network over the embedding: one game, its k nearest by cosine, and (optionally)
 * *their* k nearest, with an edge wherever one game lists another among its neighbours.
 * This is the kNN graph the "similar games" lists already imply, cut down to the part
 * around one game so its internal structure is readable — which of the neighbours are
 * neighbours of each other, which sit off on their own, and which link out to somewhere
 * else. Pure: dataset arrays in, node/edge lists out, so it can be unit-tested.
 *
 * The vectors are L2-normalised, so cosine is a dot product. Brute force over the whole
 * set per node (~25k × 64) is a couple of milliseconds; an ego of a few hundred nodes is
 * well under a second, which is fine for an exploratory page.
 */

export interface NetworkData {
	n: number;
	dim: number;
	/** Flat, L2-normalised row-major vectors. */
	emb: Float32Array;
	/** A node the graph may include (e.g. rated enough); the source is always included. */
	eligible: (i: number) => boolean;
}

export interface NetworkOpts {
	/** Neighbours per node. */
	k: number;
	/** 1 = the source and its neighbours; 2 = also the neighbours' neighbours. */
	hops: 1 | 2;
	/** Keep an edge only when both ends list each other (drops one-way "hub" links). */
	mutual: boolean;
}

export interface NetworkNode {
	/** Dataset index. */
	i: number;
	/** 0 = source, 1 = its neighbour, 2 = neighbour's neighbour. */
	hop: 0 | 1 | 2;
	/** Cosine similarity to the source. */
	sim: number;
}

export interface NetworkEdge {
	a: number;
	b: number;
	sim: number;
	mutual: boolean;
}

export interface EgoNetwork {
	source: number;
	nodes: NetworkNode[];
	edges: NetworkEdge[];
}

export function dot(emb: Float32Array, dim: number, a: number, b: number): number {
	let s = 0;
	const oa = a * dim, ob = b * dim;
	for (let d = 0; d < dim; d++) s += emb[oa + d] * emb[ob + d];
	return s;
}

/** Top-`k` eligible neighbours of `from`, best first, as `{ i, sim }`. */
export function topK(d: NetworkData, from: number, k: number): { i: number; sim: number }[] {
	// Small bounded insertion list: k is tens, n is tens of thousands.
	const best: { i: number; sim: number }[] = [];
	let floor = -Infinity;
	for (let j = 0; j < d.n; j++) {
		if (j === from || !d.eligible(j)) continue;
		const s = dot(d.emb, d.dim, from, j);
		if (best.length === k && s <= floor) continue;
		let p = best.length;
		while (p > 0 && best[p - 1].sim < s) p--;
		best.splice(p, 0, { i: j, sim: s });
		if (best.length > k) best.pop();
		if (best.length === k) floor = best[k - 1].sim;
	}
	return best;
}

export function buildEgoNetwork(d: NetworkData, source: number, o: NetworkOpts): EgoNetwork {
	const lists = new Map<number, { i: number; sim: number }[]>();
	const hopOf = new Map<number, 0 | 1 | 2>([[source, 0]]);

	lists.set(source, topK(d, source, o.k));
	for (const nb of lists.get(source)!) if (!hopOf.has(nb.i)) hopOf.set(nb.i, 1);
	// Every node in the graph gets a list, so edges between neighbours are found; the
	// second hop's lists are what bring hop-2 nodes in.
	for (const nb of lists.get(source)!) lists.set(nb.i, topK(d, nb.i, o.k));
	if (o.hops === 2) {
		for (const nb of lists.get(source)!) {
			for (const nb2 of lists.get(nb.i)!) if (!hopOf.has(nb2.i)) hopOf.set(nb2.i, 2);
		}
		for (const [i, hop] of hopOf) if (hop === 2) lists.set(i, topK(d, i, o.k));
	}

	const edges: NetworkEdge[] = [];
	const seen = new Set<string>();
	for (const [a, list] of lists) {
		for (const nb of list) {
			const b = nb.i;
			if (!hopOf.has(b)) continue;
			const key = a < b ? `${a}:${b}` : `${b}:${a}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const back = lists.get(b)?.some((x) => x.i === a) ?? false;
			if (o.mutual && !back) continue;
			edges.push({ a, b, sim: nb.sim, mutual: back });
		}
	}

	const nodes: NetworkNode[] = [...hopOf].map(([i, hop]) => ({
		i,
		hop,
		sim: i === source ? 1 : dot(d.emb, d.dim, source, i)
	}));
	return { source, nodes, edges };
}

// --- layout ------------------------------------------------------------------------------
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';

/** Node positions for the map to draw: dataset index → NDC, fitted to [-0.9, 0.9]. */
export interface NetworkLayout {
	graph: EgoNetwork;
	/** Parallel to `graph.nodes`. */
	x: Float32Array;
	y: Float32Array;
}

interface N extends SimulationNodeDatum { i: number; hop: 0 | 1 | 2 }
interface L extends SimulationLinkDatum<N> { sim: number; mutual: boolean }

/**
 * Force-directed layout of an ego network, run to rest synchronously (a few hundred nodes,
 * ~300 ticks — tens of milliseconds). Position is about the edges only: mutual neighbours
 * pull into knots, a neighbour that only links to the centre hangs off on its own. The
 * result is in NDC so `EmbeddingMap` can animate points from their map spots into it.
 */
export function layoutEgoNetwork(g: EgoNetwork, radius: (i: number) => number = () => 5): NetworkLayout {
	const ns: N[] = g.nodes.map((n, j) => {
		// Hop rings as the seed so the first ticks don't start from a random burst.
		const a = (j / g.nodes.length) * Math.PI * 2, r = n.hop === 0 ? 0 : n.hop === 1 ? 120 : 260;
		return { i: n.i, hop: n.hop, x: Math.cos(a) * r, y: Math.sin(a) * r };
	});
	const at = new Map(ns.map((n) => [n.i, n]));
	const ls: L[] = g.edges.map((e) => ({ source: at.get(e.a)!, target: at.get(e.b)!, sim: e.sim, mutual: e.mutual }));
	const sim = forceSimulation(ns)
		// Layout units are arbitrary; the result is refitted to NDC, so only the ratios
		// matter: link distances span ~60–260 across the similarity range, the repulsion and
		// collision keep a tight family (the 18xx games) from piling onto one spot.
		.force('link', forceLink<N, L>(ls).distance((l) => 60 + (1 - l.sim) * 500).strength((l) => (l.mutual ? 0.7 : 0.25)))
		.force('charge', forceManyBody().strength(-320))
		.force('collide', forceCollide<N>().radius((n) => radius(n.i) * 2 + 12))
		.force('center', forceCenter(0, 0))
		.stop();
	ns[0].fx = 0; ns[0].fy = 0;
	sim.tick(300);

	let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
	for (const n of ns) { x0 = Math.min(x0, n.x!); x1 = Math.max(x1, n.x!); y0 = Math.min(y0, n.y!); y1 = Math.max(y1, n.y!); }
	const s = 1.8 / Math.max(x1 - x0, y1 - y0, 1e-9), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
	const x = new Float32Array(ns.length), y = new Float32Array(ns.length);
	ns.forEach((n, j) => { x[j] = (n.x! - cx) * s; y[j] = -(n.y! - cy) * s; });
	return { graph: g, x, y };
}
