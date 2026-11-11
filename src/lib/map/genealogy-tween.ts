/**
 * Where each game starts and ends when a genealogy changes, so the layer can glide the tree
 * from what's on screen to the new layout in one motion (spec:
 * docs/superpowers/specs/2026-11-11-genealogy-presentation-design.md, "Motion").
 *
 * - A game on screen before and after moves from where it is to where it goes.
 * - An entering game starts at its nearest ancestor that was on screen, so new games grow out
 *   of the game they were unfolded from (and a first tree grows out of the centre).
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

	for (const { i } of next.nodes) {
		toX[i] = target.x[i]; toY[i] = target.y[i];
		let src = wasShown(i) ? i : nearest(i, nextVia, wasShown);
		if (src === -1 && wasShown(next.centre)) src = next.centre;
		if (src !== -1 && shown) { fromX[i] = shown.x[src]; fromY[i] = shown.y[src]; }
		else { fromX[i] = target.x[next.centre]; fromY[i] = target.y[next.centre]; }
	}

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
	return { fromX, fromY, toX, toY, leaving };
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Positions at eased progress `e` (0..1), written into `out`. */
export function interpolate(p: TweenPlan, e: number, out: { x: Float32Array; y: Float32Array }): void {
	for (let k = 0; k < out.x.length; k++) {
		out.x[k] = p.fromX[k] + (p.toX[k] - p.fromX[k]) * e;
		out.y[k] = p.fromY[k] + (p.toY[k] - p.fromY[k]) * e;
	}
}
