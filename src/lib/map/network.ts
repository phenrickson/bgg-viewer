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
	 * the caller keeps one cache per eligibility and hands it in. Optional. A list serves any
	 * k up to its length, so one scanned at `scanK` serves every k on the slider.
	 */
	cache?: Map<number, { i: number; sim: number }[]>;
	/** How many to keep per scan, at least: the largest k the caller will ask for. */
	scanK?: number;
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
	/**
	 * Games expanded by hand: each adds its own neighbours as a ring beyond it, wherever it
	 * sits. Rings expand every game to a depth; this expands one, past it.
	 */
	open?: ReadonlySet<number>;
}

export interface NetworkNode {
	/** Dataset index. */
	i: number;
	/** Steps from the source: 1 = its neighbour, 2 = neighbour's neighbour, and so on (an expanded game's neighbours sit one past it). */
	hop: number;
	/** Cosine similarity to the source. */
	sim: number;
	/** The expanded game that brought it in; absent for the rings'. */
	from?: number;
	/** Neighbours of its own not yet in the graph: what expanding it would add. */
	more: number;
	/** Expanded by hand (`NetworkOpts.open`). */
	open: boolean;
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
export function topK(d: NetworkData, from: number, want: number): { i: number; sim: number }[] {
	const hit = d.cache?.get(from);
	if (hit && hit.length >= want) return hit.length === want ? hit : hit.slice(0, want);
	const k = Math.max(want, d.scanK ?? want);
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
	return best.length > want ? best.slice(0, want) : best;
}

export function buildEgoNetwork(d: NetworkData, source: number, o: NetworkOpts): EgoNetwork {
	const lists = new Map<number, { i: number; sim: number }[]>();
	// The floor is applied over `topK`, so its cache serves every floor.
	const floor = o.floor ?? -Infinity;
	const near = (i: number) => topK(d, i, o.k).filter((x) => x.sim >= floor);
	const hopOf = new Map<number, number>([[source, 0]]);
	const from = new Map<number, number>();

	// Ring by ring: the previous ring's lists name the next ring's nodes, and every node in
	// the graph gets a list of its own so edges between them are found.
	lists.set(source, near(source));
	let ring: number[] = [source];
	for (let h = 1; h <= o.hops; h++) {
		const next: number[] = [];
		for (const i of ring) for (const nb of lists.get(i)!) if (!hopOf.has(nb.i)) { hopOf.set(nb.i, h); next.push(nb.i); }
		for (const i of next) lists.set(i, near(i));
		ring = next;
	}

	// Then the hand-expanded games, until none adds more: one can be brought in by another.
	const pending = new Set(o.open ?? []);
	for (let grew = true; grew && pending.size; ) {
		grew = false;
		for (const x of pending) {
			if (!hopOf.has(x)) continue;
			pending.delete(x);
			grew = true;
			for (const nb of lists.get(x)!) {
				if (hopOf.has(nb.i)) continue;
				hopOf.set(nb.i, hopOf.get(x)! + 1);
				from.set(nb.i, x);
				lists.set(nb.i, near(nb.i));
			}
		}
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
		sim: i === source ? 1 : dot(d.emb, d.dim, source, i),
		...(from.has(i) ? { from: from.get(i)! } : {}),
		more: lists.get(i)!.filter((x) => !hopOf.has(x.i)).length,
		open: !!o.open?.has(i)
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
	// A hand-expanded game's neighbours hang off it, so they grow out of it and fold back into it.
	return new Map(g.nodes.map((n) => [n.i, n.i === g.source ? -1 : n.from ?? best.get(n.i)?.via ?? g.source]));
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

export interface SimNode extends SimulationNodeDatum { i: number; hop: number }
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
		const a = (j / g.nodes.length) * Math.PI * 2, r = [0, 120, 260, 420][Math.min(3, n.hop)];
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
	seed?: ReadonlyMap<number, [number, number]>,
	/**
	 * Hold the seeded games exactly where they were and place only the new ones, each started
	 * beside the game that brought it in. For a change of k, rings or floor on the same centre:
	 * a gentle restart still re-formed the graph, since the links themselves change (games that
	 * stayed moved a median 5–17% of the canvas, measured 2026-11-11); held, they don't move.
	 */
	hold = false
): NetworkLayout {
	const { sim, nodes: ns } = egoSimulation(g, radius, seed);
	if (hold && seed) {
		const par = egoParents(g);
		const at = new Map(ns.map((n) => [n.i, n]));
		let r = 1;
		const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
		// `ns` is breadth-first, so a new game's parent is placed before it.
		for (const n of ns) {
			if (seed.has(n.i)) { n.fx = n.x; n.fy = n.y; continue; }
			if (n.i === g.source) continue;
			const p = at.get(par.get(n.i)!)!;
			// Outward from the centre, spread a little, so it grows the graph rather than its middle.
			const out = p.x || p.y ? Math.atan2(p.y!, p.x!) : rand() * Math.PI * 2;
			const a = out + (rand() - 0.5) * 2;
			n.x = p.x! + Math.cos(a) * 40; n.y = p.y! + Math.sin(a) * 40;
		}
		// No centring: it shifts every game toward the centroid each tick, and with the old ones
		// pinned only the new ones keep the shift, which dragged them back through the middle.
		// The centre is pinned at the origin anyway.
		sim.force('center', null);
		sim.alpha(0.3);
	} else {
		// Seeded mostly from a previous layout (a new centre): a gentle restart, so games that
		// stay settle near where they were instead of the whole graph re-forming.
		const seeded = seed ? g.nodes.filter((n) => seed.has(n.i)).length / g.nodes.length : 0;
		if (seeded > 0.5) sim.alpha(0.3);
	}
	sim.tick(300);

	let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
	for (const n of ns) { x0 = Math.min(x0, n.x!); x1 = Math.max(x1, n.x!); y0 = Math.min(y0, n.y!); y1 = Math.max(y1, n.y!); }
	const s = 1.8 / Math.max(x1 - x0, y1 - y0, 1e-9), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
	const x = new Float32Array(ns.length), y = new Float32Array(ns.length);
	const px = new Float32Array(ns.length), py = new Float32Array(ns.length);
	ns.forEach((n, j) => { x[j] = (n.x! - cx) * s; y[j] = -(n.y! - cy) * s; px[j] = n.x!; py[j] = n.y!; });
	return { graph: g, x, y, px, py };
}
