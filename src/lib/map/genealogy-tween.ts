/**
 * Where each game starts and ends when a genealogy changes, so the layer can glide the tree
 * from what's on screen to the new layout in one motion (spec:
 * docs/superpowers/specs/2026-11-11-genealogy-presentation-design.md, "Motion").
 *
 * - A game on screen before and after moves from where it is to where it goes.
 * - An entering game starts at its nearest ancestor that was on screen, so new games grow out
 *   of the game they were unfolded from (and a first tree grows out of the centre). One whose
 *   parent is entering too starts where that parent lands, one `level` later, so a view grows
 *   outward ring by ring rather than bursting out all at once (Phil, 2026-11-11).
 * - A leaving game glides into its nearest ancestor that stays, then is hidden.
 *
 * Pure: index arrays in, start/end arrays out.
 */

/** A tree as the tween needs it: each game's index and the game it hangs off (-1 for the centre). */
export interface TweenTree {
	nodes: { i: number; via: number }[];
	centre: number;
}

export interface TweenPlan {
	fromX: Float32Array;
	fromY: Float32Array;
	toX: Float32Array;
	toY: Float32Array;
	/** Games in the old tree but not the new one: drawn until the tween lands, then hidden. */
	leaving: number[];
	/** When each game sets off, in steps: 0 now; an entering game one after its entering parent. */
	level: Uint8Array;
	/** The highest `level`, so the glide knows when the last game lands. */
	levels: number;
}

/** Walk `via` links from `i` until `keep` holds; -1 if the chain runs out. */
function nearest(i: number, via: Map<number, number>, keep: (j: number) => boolean): number {
	let p = via.get(i) ?? -1;
	const seen = new Set<number>();
	while (p !== -1 && !keep(p) && !seen.has(p)) {
		seen.add(p);
		p = via.get(p) ?? -1;
	}
	return p !== -1 && keep(p) ? p : -1;
}

/**
 * `shown` is what's on screen now (positions by game index) for the games in `prev`; null on
 * the first draw. `target` is the new layout's positions by game index.
 */
export function planTween(
	n: number,
	prev: TweenTree | null,
	shown: { x: ArrayLike<number>; y: ArrayLike<number> } | null,
	next: TweenTree,
	target: { x: ArrayLike<number>; y: ArrayLike<number> }
): TweenPlan {
	const fromX = new Float32Array(n), fromY = new Float32Array(n);
	const toX = new Float32Array(n), toY = new Float32Array(n);
	const prevVia = new Map((prev?.nodes ?? []).map((nd) => [nd.i, nd.via]));
	const nextVia = new Map(next.nodes.map((nd) => [nd.i, nd.via]));
	const wasShown = (j: number) => !!shown && prevVia.has(j);
	const level = new Uint8Array(n);

	// Steps after its entering parent sets off; 0 for a game whose parent is on screen.
	const depth = new Map<number, number>();
	const stepOf = (i: number): number => {
		const known = depth.get(i);
		if (known !== undefined) return known;
		depth.set(i, 0); // guards a cycle
		const p = nextVia.get(i) ?? -1;
		const d = wasShown(i) || p === -1 || wasShown(p) ? 0 : stepOf(p) + 1;
		depth.set(i, d);
		return d;
	};

	for (const { i } of next.nodes) {
		toX[i] = target.x[i]; toY[i] = target.y[i];
		const p = nextVia.get(i) ?? -1;
		if (!wasShown(i) && p !== -1 && !wasShown(p) && stepOf(i) > 0) {
			// Its parent is entering too: start where the parent lands, a step later.
			fromX[i] = target.x[p]; fromY[i] = target.y[p];
			level[i] = Math.min(255, stepOf(i));
			continue;
		}
		let src = wasShown(i) ? i : nearest(i, nextVia, wasShown);
		if (src === -1 && wasShown(next.centre)) src = next.centre;
		if (src !== -1 && shown) { fromX[i] = shown.x[src]; fromY[i] = shown.y[src]; }
		else { fromX[i] = target.x[next.centre]; fromY[i] = target.y[next.centre]; }
	}
	// A first view's centre enters without moving: don't make its ring wait on it.
	let lo = 255, levels = 0;
	for (const { i } of next.nodes) if (fromX[i] !== toX[i] || fromY[i] !== toY[i]) lo = Math.min(lo, level[i]);
	if (lo === 255) lo = 0;
	for (const { i } of next.nodes) { level[i] = Math.max(0, level[i] - lo); levels = Math.max(levels, level[i]); }

	const leaving: number[] = [];
	if (prev && shown) {
		for (const { i } of prev.nodes) {
			if (nextVia.has(i)) continue;
			leaving.push(i);
			fromX[i] = shown.x[i]; fromY[i] = shown.y[i];
			const dst = nearest(i, prevVia, (j) => nextVia.has(j));
			const d = dst === -1 ? next.centre : dst;
			toX[i] = target.x[d]; toY[i] = target.y[d];
		}
	}
	return { fromX, fromY, toX, toY, leaving, level, levels };
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Positions written into `out`: `e` is eased progress (0..1), a number for every game at
 * once, or per level (`e(level)`) for a staggered glide.
 */
export function interpolate(p: TweenPlan, e: number | ((level: number) => number), out: { x: Float32Array; y: Float32Array }): void {
	const byLevel = typeof e === 'number' ? null : Array.from({ length: p.levels + 1 }, (_, l) => e(l));
	for (let k = 0; k < out.x.length; k++) {
		const ek = byLevel ? byLevel[p.level[k]] : (e as number);
		out.x[k] = p.fromX[k] + (p.toX[k] - p.fromX[k]) * ek;
		out.y[k] = p.fromY[k] + (p.toY[k] - p.fromY[k]) * ek;
	}
}
