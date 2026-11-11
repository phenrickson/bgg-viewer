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
	/**
	 * Memo of `topK` results, keyed by node. Each list is a full scan of the set (~2ms per
	 * node), and re-centring on a neighbour re-asks for most of the lists just computed, so
	 * the caller keeps one cache per (k, eligibility) and hands it in. Optional.
	 */
	cache?: Map<number, { i: number; sim: number }[]>;
}

export interface NetworkOpts {
	/** Neighbours per node. */
	k: number;
	/** 1 = the source and its neighbours; 2 = also the neighbours' neighbours; 3 = one more ring. */
	hops: 1 | 2 | 3;
	/** Keep an edge only when both ends list each other (drops one-way "hub" links). */
	mutual: boolean;
	/**
	 * Similarity floor: a game's neighbours are its `k` closest that score at least this, so
	 * a game with nothing close gets few or none, as in the tree. Omitted: no floor.
	 */
	floor?: number;
}

export interface NetworkNode {
	/** Dataset index. */
	i: number;
	/** 0 = source, 1 = its neighbour, 2 = neighbour's neighbour, 3 = one further. */
	hop: 0 | 1 | 2 | 3;
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
	const hit = d.cache?.get(from);
	if (hit) return hit;
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
	d.cache?.set(from, best);
	return best;
}

export function buildEgoNetwork(d: NetworkData, source: number, o: NetworkOpts): EgoNetwork {
	const lists = new Map<number, { i: number; sim: number }[]>();
	// The floor is applied over `topK`, so its cache (keyed by k alone) still serves.
	const floor = o.floor ?? -Infinity;
	const near = (i: number) => topK(d, i, o.k).filter((x) => x.sim >= floor);
	const hopOf = new Map<number, 0 | 1 | 2 | 3>([[source, 0]]);

	// Ring by ring: the previous ring's lists name the next ring's nodes, and every node in
	// the graph gets a list of its own so edges between them are found.
	lists.set(source, near(source));
	let ring: number[] = [source];
	for (let h = 1 as 1 | 2 | 3; h <= o.hops; h++) {
		const next: number[] = [];
		for (const i of ring) for (const nb of lists.get(i)!) if (!hopOf.has(nb.i)) { hopOf.set(nb.i, h); next.push(nb.i); }
		for (const i of next) lists.set(i, near(i));
		ring = next;
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

/**
 * Each node's parent for motion: the neighbour one ring in that it's most similar to (by
 * edge similarity), so a new game grows out of the game that pulled it in. The source's is -1.
 */
export function egoParents(g: EgoNetwork): Map<number, number> {
	const hop = new Map(g.nodes.map((n) => [n.i, n.hop]));
	const best = new Map<number, { via: number; sim: number }>();
	const offer = (child: number, via: number, sim: number) => {
		if (hop.get(via)! !== hop.get(child)! - 1) return;
		const cur = best.get(child);
		if (!cur || sim > cur.sim) best.set(child, { via, sim });
	};
	for (const e of g.edges) { offer(e.a, e.b, e.sim); offer(e.b, e.a, e.sim); }
	return new Map(g.nodes.map((n) => [n.i, n.i === g.source ? -1 : best.get(n.i)?.via ?? g.source]));
}

/**
 * The links to draw. Every game keeps its path link (to its parent from `egoParents`, the
 * game one ring in that brought it in), so each is traceable back to the centre whatever
 * the setting; `links` decides only the rest: mutual ones, or all. Without the path links,
 * "mutual" left one-way-found games, and everything found through them, floating unconnected
 * (Phil, 2026-11-11).
 */
export function shownEdges(g: EgoNetwork, parents: Map<number, number>, links: 'mutual' | 'all'): NetworkEdge[] {
	return g.edges.filter((e) => links === 'all' || e.mutual || parents.get(e.a) === e.b || parents.get(e.b) === e.a);
}

// --- layout ------------------------------------------------------------------------------
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3-force';

/** Node positions for the map to draw: dataset index → NDC, fitted to [-0.9, 0.9]. */
export interface NetworkLayout {
	graph: EgoNetwork;
	/** Parallel to `graph.nodes`. */
	x: Float32Array;
	y: Float32Array;
	/** The same positions in the simulation's own units (before the NDC fit), for a live
	 * simulation to pick up where the static one stopped. */
	px: Float32Array;
	py: Float32Array;
}

export interface SimNode extends SimulationNodeDatum { i: number; hop: 0 | 1 | 2 | 3 }
export interface SimLink extends SimulationLinkDatum<SimNode> { sim: number; mutual: boolean }

/**
 * The force model, shared by the static layout and a live one: link distance from
 * similarity, repulsion and collision sized so a tight family (the 18xx games) spreads
 * rather than piling up. Layout units are arbitrary; only the ratios matter. Returns the
 * simulation stopped, with the centre pinned at the origin.
 */
export function egoSimulation(
	g: EgoNetwork,
	radius: (i: number) => number = () => 5,
	seed?: ReadonlyMap<number, [number, number]>
) {
	// A seed is the previous layout (simulation units), shifted so this graph's centre sits at
	// the origin it's pinned to: games already placed start where they were.
	const s0 = seed?.get(g.source);
	const ns: SimNode[] = g.nodes.map((n, j) => {
		const s = seed?.get(n.i);
		if (s) return { i: n.i, hop: n.hop, x: s[0] - (s0?.[0] ?? 0), y: s[1] - (s0?.[1] ?? 0) };
		// Hop rings otherwise, so the first ticks don't start from a random burst.
		const a = (j / g.nodes.length) * Math.PI * 2, r = [0, 120, 260, 420][n.hop];
		return { i: n.i, hop: n.hop, x: Math.cos(a) * r, y: Math.sin(a) * r };
	});
	const at = new Map(ns.map((n) => [n.i, n]));
	const ls: SimLink[] = g.edges.map((e) => ({ source: at.get(e.a)!, target: at.get(e.b)!, sim: e.sim, mutual: e.mutual }));
	const sim = forceSimulation(ns)
		.force('link', forceLink<SimNode, SimLink>(ls).distance((l) => 60 + (1 - l.sim) * 500).strength((l) => (l.mutual ? 0.7 : 0.25)))
		.force('charge', forceManyBody().strength(-320))
		.force('collide', forceCollide<SimNode>().radius((n) => radius(n.i) * 2 + 12))
		.force('center', forceCenter(0, 0))
		.stop();
	ns[0].fx = 0; ns[0].fy = 0;
	return { sim, nodes: ns, links: ls };
}

/**
 * Force-directed layout of an ego network, run to rest synchronously (a few hundred nodes,
 * ~300 ticks — tens of milliseconds). Position is about the edges only: mutual neighbours
 * pull into knots, a neighbour that only links to the centre hangs off on its own. The
 * result is in NDC so `EmbeddingMap` can animate points from their map spots into it.
 */
export function layoutEgoNetwork(
	g: EgoNetwork,
	radius: (i: number) => number = () => 5,
	seed?: ReadonlyMap<number, [number, number]>
): NetworkLayout {
	const { sim, nodes: ns } = egoSimulation(g, radius, seed);
	// Seeded mostly from a previous layout: a gentle restart, so games that stay settle near
	// where they were instead of the whole graph re-forming (a change of k, hops or centre
	// reads as the graph adjusting, not reshuffling).
	const seeded = seed ? g.nodes.filter((n) => seed.has(n.i)).length / g.nodes.length : 0;
	if (seeded > 0.5) sim.alpha(0.3);
	sim.tick(300);

	let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
	for (const n of ns) { x0 = Math.min(x0, n.x!); x1 = Math.max(x1, n.x!); y0 = Math.min(y0, n.y!); y1 = Math.max(y1, n.y!); }
	const s = 1.8 / Math.max(x1 - x0, y1 - y0, 1e-9), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
	const x = new Float32Array(ns.length), y = new Float32Array(ns.length);
	const px = new Float32Array(ns.length), py = new Float32Array(ns.length);
	ns.forEach((n, j) => { x[j] = (n.x! - cx) * s; y[j] = -(n.y! - cy) * s; px[j] = n.x!; py[j] = n.y!; });
	return { graph: g, x, y, px, py };
}
