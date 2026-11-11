/**
 * The tool's motion: one ease-out glide from what's on screen to a new layout (spec:
 * docs/superpowers/specs/2026-11-11-genealogy-network-flip-design.md). The page owns one and
 * hands it to whichever layer is mounted, so it outlives a layer swap. That's what lets the
 * Genealogy ⇄ Network flip be the same glide as an unfold: the network layer starts from where
 * the tree layer left every game.
 *
 * Layers call `to()` when their layout changes and draw from `cur` (positions this frame) plus
 * `leaving` (games folding away, each with the game it hung off). Where games start and end is
 * `planTween`'s job.
 */
import { planTween, interpolate, easeOutCubic, type TweenTree } from './genealogy-tween';

export interface Leaving {
	i: number;
	/** The game it hung off in the old view; -1 for the old centre. */
	via: number;
}

/** Snappy, not ceremonial: each game's own glide. */
const DURATION = 450;
/**
 * Between one ring setting off and the next (`TweenPlan.level`): about two-thirds through
 * the parent's ease, when it's nearly landed, so a child comes out of where its parent is.
 */
const STEP = 280;
/** A deep unfold mustn't drag on: past this many steps, the rest set off together. */
const MAX_STEPS = 3;
/**
 * Labels, ticks and badges wait for the games to land, then fade in over this — Recommend's
 * rhythm (content arrives once things have settled; text never slides around attached to a
 * moving dot).
 */
const SETTLE = 220;

export class Glide {
	readonly n: number;
	/** Positions on screen this frame — a new array identity each frame (`PointCanvas` redraws on it). */
	cur = $state.raw<{ x: Float32Array; y: Float32Array }>({ x: new Float32Array(0), y: new Float32Array(0) });
	/** Games from the previous view folding away; drawn until the glide lands. */
	leaving = $state.raw<Leaving[]>([]);
	/**
	 * How far the text has come in: 0 while games are moving (draw no labels, ticks or badges),
	 * rising to 1 over `SETTLE` ms once they've landed. Layers multiply their text's alpha by it.
	 */
	settle = $state(1);

	#bufs: { x: Float32Array; y: Float32Array }[];
	#flip = 0;
	#prev: TweenTree | null = null;
	/** The last plan's games in play: the only entries of either buffer that aren't 0. */
	#touched: Int32Array = new Int32Array(0);
	#onScreen: { x: Float32Array; y: Float32Array } | null = null;
	#raf = 0;
	#reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	constructor(n: number) {
		this.n = n;
		this.#bufs = [0, 1].map(() => ({ x: new Float32Array(n), y: new Float32Array(n) }));
		this.cur = this.#bufs[0];
	}

	/** Glide from what's on screen to `target` (positions by game index) for `tree`. */
	to(tree: TweenTree, target: { x: ArrayLike<number>; y: ArrayLike<number> }): void {
		cancelAnimationFrame(this.#raf);
		const plan = planTween(this.n, this.#prev, this.#onScreen, tree, target);
		const prevVia = new Map((this.#prev?.nodes ?? []).map((nd) => [nd.i, nd.via]));
		const folding = plan.leaving.length > 0;
		this.leaving = folding ? plan.leaving.map((i) => ({ i, via: prevVia.get(i) ?? -1 })) : [];
		this.#prev = tree;
		// `interpolate` writes only the games in play, so clear the last plan's from both
		// buffers: a game that's left the view goes back to 0, as if every game were written.
		for (const b of this.#bufs) for (const i of this.#touched) { b.x[i] = 0; b.y[i] = 0; }
		this.#touched = plan.moving;
		const start = performance.now();
		const total = DURATION + Math.min(plan.levels, MAX_STEPS) * STEP;
		if (!this.#reduced) this.settle = 0;
		/** After landing: no more positions, just the text fading in. */
		const fade = (now: number) => {
			const t = Math.min(1, (now - start - total) / SETTLE);
			this.settle = easeOutCubic(Math.max(0, t));
			if (t < 1) this.#raf = requestAnimationFrame(fade);
		};
		const step = (now: number) => {
			const ms = this.#reduced ? total : now - start;
			const t = Math.min(1, ms / total);
			const out = this.#bufs[(this.#flip = 1 - this.#flip)];
			interpolate(plan, (l) => easeOutCubic(Math.min(1, Math.max(0, (ms - Math.min(l, MAX_STEPS) * STEP) / DURATION))), out);
			this.#onScreen = out;
			this.cur = out;
			if (t < 1) { this.#raf = requestAnimationFrame(step); return; }
			if (folding) this.leaving = [];
			if (this.#reduced) this.settle = 1;
			else this.#raf = requestAnimationFrame(fade);
		};
		step(start);
	}

	stop(): void {
		cancelAnimationFrame(this.#raf);
	}
}
