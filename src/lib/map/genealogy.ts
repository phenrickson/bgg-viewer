/**
 * One game's genealogy over the embedding: the games like it, split by publication year
 * into earlier (up), later (down) and same-year (beside), and grown a generation at a time
 * on request. Pure: dataset arrays and settings in, a tree out — so the same code can back
 * a server endpoint later.
 *
 * Rules (see docs/superpowers/specs/2026-10-12-game-genealogy-design.md):
 * - Two games link when their cosine similarity is at least `threshold`. No popularity
 *   floor: obscure games are part of the story in both directions.
 * - Chained: a parent's parents are found from that parent, never checked back against
 *   the centre, so a line can drift several generations out.
 * - Ancestors only unfold upward and descendants downward; same-year games never unfold.
 * - Each game appears once, under the game it was first reached through (breadth-first).
 * - Each unfold shows the strongest `cap`, unless expanded; `hidden` counts the rest.
 *
 * The whole tree is rebuilt from (centre, threshold, unfolded, expanded) on every change.
 * That keeps it a pure function of URL state, and a threshold move keeps every unfolded
 * game that still qualifies for free. Rebuilds are cheap because `linked` is memoised.
 */
import { dot } from './network';

export interface GenealogyInput {
	n: number;
	dim: number;
	/** Flat, L2-normalised row-major vectors, coordinates order. */
	emb: Float32Array;
	/** Index → game id. */
	ids: Int32Array;
	/** Index → year published; 0 = unknown (BC years are negative). */
	year: Int16Array;
	/** Index → its `Game:` / `Series:` family ids. */
	families: number[][];
	/** Index → game ids it reimplements or expands, or that reimplement or expand it. */
	related: number[][];
	/** The index has a vector. */
	has: (i: number) => boolean;
	/** Memo of `linked` lists for ONE threshold; the caller replaces it when the threshold moves. */
	cache?: Map<number, Link[]>;
}

export interface Link {
	i: number;
	sim: number;
}

export type Dir = 'up' | 'down' | 'same';
export type LinkKind = 'related' | 'family' | 'influence';

export interface GenealogyNode {
	i: number;
	side: 'centre' | Dir;
	/** Generations from the centre: negative up, positive down, 0 for the centre and same-year games. */
	gen: number;
	/** The game this one was reached from; -1 for the centre. */
	via: number;
	/** Similarity of the link from `via`; 1 for the centre. */
	sim: number;
	kind: LinkKind | null;
	/** Its own parents (up) or children (down) are shown. */
	unfolded: boolean;
	/** Qualifying parents/children not anywhere in the tree: all of them if folded, the overflow past the cap if not. */
	hidden: number;
}

export interface Genealogy {
	centre: number;
	/** False when the centre has no vector or no year: nothing can be placed. */
	placeable: boolean;
	/** `nodes[0]` is the centre. */
	nodes: GenealogyNode[];
	/** The centre's own overflow in each direction. */
	centreHidden: Record<Dir, number>;
}

export interface GenealogyOpts {
	threshold: number;
	/** Strongest links shown per unfold, unless expanded. */
	cap: number;
	/** Indices whose own direction is unfolded. The centre is always unfolded. */
	unfolded: ReadonlySet<number>;
	/** `expandKey(i, dir)`: show every qualifying link past the cap. */
	expanded: ReadonlySet<string>;
	/** Include same-year games beside the centre. */
	same: boolean;
}

export const expandKey = (i: number, dir: Dir): string => `${i}:${dir}`;

/** Has a vector and a known year, so it can sit in a tree at all. */
export function placeable(d: GenealogyInput, i: number): boolean {
	return d.has(i) && d.year[i] !== 0;
}

/** Every placeable game at or above `threshold` to `from`, best first (ties by index). */
export function linked(d: GenealogyInput, from: number, threshold: number): Link[] {
	const hit = d.cache?.get(from);
	if (hit) return hit;
	const out: Link[] = [];
	for (let j = 0; j < d.n; j++) {
		if (j === from || !placeable(d, j)) continue;
		const s = dot(d.emb, d.dim, from, j);
		if (s >= threshold) out.push({ i: j, sim: s });
	}
	out.sort((p, q) => q.sim - p.sim || p.i - q.i);
	d.cache?.set(from, out);
	return out;
}

/** Reimplementation/expansion (either end lists it) beats a shared family beats similarity alone. */
export function linkKind(d: GenealogyInput, a: number, b: number): LinkKind {
	if (d.related[a].includes(d.ids[b]) || d.related[b].includes(d.ids[a])) return 'related';
	const fa = d.families[a];
	if (fa.length && d.families[b].some((f) => fa.includes(f))) return 'family';
	return 'influence';
}

function inDir(d: GenealogyInput, from: number, to: number, dir: Dir): boolean {
	const a = d.year[from], b = d.year[to];
	return dir === 'up' ? b < a : dir === 'down' ? b > a : b === a;
}

export function buildGenealogy(d: GenealogyInput, centre: number, o: GenealogyOpts): Genealogy {
	const root: GenealogyNode = { i: centre, side: 'centre', gen: 0, via: -1, sim: 1, kind: null, unfolded: true, hidden: 0 };
	const g: Genealogy = { centre, placeable: placeable(d, centre), nodes: [root], centreHidden: { up: 0, down: 0, same: 0 } };
	if (!g.placeable) return g;

	const seen = new Set<number>([centre]);
	const candidates = (from: number, dir: Dir) =>
		linked(d, from, o.threshold).filter((l) => !seen.has(l.i) && inDir(d, from, l.i, dir));
	const attach = (from: GenealogyNode, dir: Dir, gen: number): GenealogyNode[] => {
		const c = candidates(from.i, dir);
		const shown = o.expanded.has(expandKey(from.i, dir)) ? c : c.slice(0, o.cap);
		return shown.map((l) => {
			seen.add(l.i);
			const node: GenealogyNode = {
				i: l.i, side: dir, gen, via: from.i, sim: l.sim,
				kind: linkKind(d, from.i, l.i), unfolded: false, hidden: 0
			};
			g.nodes.push(node);
			return node;
		});
	};

	if (o.same) attach(root, 'same', 0);
	for (const dir of ['up', 'down'] as const) {
		const step = dir === 'up' ? -1 : 1;
		let ring = attach(root, dir, step);
		while (ring.length) {
			const next: GenealogyNode[] = [];
			for (const node of ring) {
				if (!o.unfolded.has(node.i)) continue;
				node.unfolded = true;
				next.push(...attach(node, dir, node.gen + step));
			}
			ring = next;
		}
	}

	// Overflow last, against the finished tree: a game already placed elsewhere isn't "more".
	for (const dir of ['up', 'down'] as const) g.centreHidden[dir] = candidates(centre, dir).length;
	if (o.same) g.centreHidden.same = candidates(centre, 'same').length;
	for (const node of g.nodes) {
		if (node.side === 'up' || node.side === 'down') node.hidden = candidates(node.i, node.side).length;
	}
	return g;
}
