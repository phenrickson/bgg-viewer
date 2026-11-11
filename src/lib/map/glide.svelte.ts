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
 * The page's first glide, in Recommend's rhythm (the app's `.rise-in`): the chosen game grows
 * in first, then, `lead` beats later, its games come out of it one at a time, best first,
 * `step` ms apart, each growing as it travels. Past `cap` beats the rest set off together, so
 * a big view doesn't take seconds. Slow enough to see what the view is (Phil, 2026-11-11);
 * every later change keeps the snappy pace.
 */
const INTRO = { duration: 700, step: 80, lead: 9, cap: 20 };
/**
 * In the opening, the chosen game is named as it grows in, and its year fades in right after
 * (`yearIn`), before the first of its games sets off at `lead` beats (Phil, 2026-11-11).
 */
const YEAR_AT = 330, YEAR_FADE = 300;
/**
 * Labels, ticks and badges wait for the games to land, then fade in over this — Recommend's
 * rhythm (content arrives once things have settled; text never slides around attached to a
 * moving dot).
 */
const SETTLE = 220;

/** The same games in both trees (order aside). */
function sameGames(a: TweenTree, b: TweenTree): boolean {
	if (a.nodes.length !== b.nodes.length) return false;
	const ids = new Set(a.nodes.map((nd) => nd.i));
	return b.nodes.every((nd) => ids.has(nd.i));
}

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
	/**
	 * How far each entering game has grown in, 0..1 (1 for every other game), for this frame:
	 * read it alongside `cur`. Entering games are drawn at their size times this and their
	 * links fade in with it, so a game arrives rather than appearing on top of its parent.
	 */
	readonly grow: Float32Array;
	/**
	 * The opening is under way, from its first frame until its text has settled: layers name
	 * the chosen game throughout (`ink.titleIn`), its name at `grow[centre]` and its year at
	 * `yearIn`. Read per frame, alongside `cur`.
	 */
	opening = false;
	/** How far the chosen game's year has faded in during the opening, 0..1. */
	yearIn = 1;

	#bufs: { x: Float32Array; y: Float32Array }[];
	#flip = 0;
	#prev: TweenTree | null = null;
	/** The last plan's games in play: the only entries of either buffer that aren't 0. */
	#touched: Int32Array = new Int32Array(0);
	#onScreen: { x: Float32Array; y: Float32Array } | null = null;
	#raf = 0;
	/** Games entering in the glide under way (`grow` < 1 only for these). */
	#entering: Int32Array = new Int32Array(0);
	#sizeBuf: Uint8Array;
	#sizeBase: Uint8Array | null = null;
	/** When the opening glide lands (`performance.now()`); 0 once it has. */
	#introUntil = 0;
	#reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	constructor(n: number) {
		this.n = n;
		this.#bufs = [0, 1].map(() => ({ x: new Float32Array(n), y: new Float32Array(n) }));
		this.cur = this.#bufs[0];
		this.grow = new Float32Array(n).fill(1);
		this.#sizeBuf = new Uint8Array(n);
	}

	/**
	 * A layer's `size` with entering games scaled by `grow`, for this frame. `size` itself while
	 * nothing is entering; otherwise a kept buffer, refreshed from `size` when that changes, with
	 * only the entering games rewritten.
	 */
	sized(size: Uint8Array): Uint8Array {
		// Before the first glide nothing has arrived: the buffer is still all zeros.
		if (this.#prev === null) return this.#sizeBuf.length === size.length ? this.#sizeBuf : new Uint8Array(size.length);
		if (this.#entering.length === 0) return size;
		if (this.#sizeBase !== size || this.#sizeBuf.length !== size.length) {
			if (this.#sizeBuf.length !== size.length) this.#sizeBuf = new Uint8Array(size.length);
			this.#sizeBuf.set(size);
			this.#sizeBase = size;
		}
		for (const i of this.#entering) this.#sizeBuf[i] = Math.round(size[i] * this.grow[i]);
		return this.#sizeBuf;
	}

	/** Glide from what's on screen to `target` (positions by game index) for `tree`. */
	to(tree: TweenTree, target: { x: ArrayLike<number>; y: ArrayLike<number> }): void {
		cancelAnimationFrame(this.#raf);
		// The opening is the first glide, or a re-ask for the same games before it has landed
		// (the canvas measuring itself, a resize): that restarts it rather than cutting it short.
		const intro = this.#prev === null || (performance.now() < this.#introUntil && sameGames(this.#prev, tree));
		const plan = planTween(this.n, intro ? null : this.#prev, intro ? null : this.#onScreen, tree, target);
		const prevVia = new Map((this.#prev?.nodes ?? []).map((nd) => [nd.i, nd.via]));
		const { duration, step: gap } = intro ? INTRO : { duration: DURATION, step: STEP };
		const maxSteps = intro ? INTRO.lead + INTRO.cap : MAX_STEPS;
		const was = this.#onScreen && !intro ? new Set(prevVia.keys()) : new Set<number>();
		if (intro) {
			// Every game comes out of the chosen one, a beat apart in the tree's own order (best
			// first, nearer rings first), after the chosen game has grown in alone.
			const c = tree.centre;
			const rest = tree.nodes.map((nd, k) => ({ i: nd.i, k })).filter((x) => x.i !== c)
				.sort((a, b) => plan.level[a.i] - plan.level[b.i] || a.k - b.k);
			plan.level[c] = 0;
			rest.forEach((x, r) => {
				plan.level[x.i] = INTRO.lead + Math.min(r, INTRO.cap);
				plan.fromX[x.i] = plan.toX[c]; plan.fromY[x.i] = plan.toY[c];
			});
			plan.levels = rest.length ? INTRO.lead + Math.min(rest.length - 1, INTRO.cap) : 0;
		}
		// Back to full size whatever the last glide left half-grown; then this one's entering games.
		for (const i of this.#entering) this.grow[i] = 1;
		this.#entering = Int32Array.from(tree.nodes.filter((nd) => !was.has(nd.i)), (nd) => nd.i);
		for (const i of this.#entering) this.grow[i] = 0;
		this.#sizeBase = null;
		const folding = plan.leaving.length > 0;
		this.leaving = folding ? plan.leaving.map((i) => ({ i, via: prevVia.get(i) ?? -1 })) : [];
		this.#prev = tree;
		// `interpolate` writes only the games in play, so clear the last plan's from both
		// buffers: a game that's left the view goes back to 0, as if every game were written.
		for (const b of this.#bufs) for (const i of this.#touched) { b.x[i] = 0; b.y[i] = 0; }
		this.#touched = plan.moving;
		const start = performance.now();
		this.#introUntil = intro ? start + duration + Math.min(plan.levels, maxSteps) * gap : 0;
		this.opening = intro && !this.#reduced;
		this.yearIn = this.opening ? 0 : 1;
		const total = duration + Math.min(plan.levels, maxSteps) * gap;
		const ease = (l: number, ms: number) => easeOutCubic(Math.min(1, Math.max(0, (ms - Math.min(l, maxSteps) * gap) / duration)));
		if (!this.#reduced) this.settle = 0;
		/** After landing: no more positions, just the text fading in. */
		const fade = (now: number) => {
			const t = Math.min(1, (now - start - total) / SETTLE);
			if (t >= 1) this.opening = false;
			this.settle = easeOutCubic(Math.max(0, t));
			if (t < 1) this.#raf = requestAnimationFrame(fade);
		};
		const step = (now: number) => {
			const ms = this.#reduced ? total : now - start;
			const t = Math.min(1, ms / total);
			const out = this.#bufs[(this.#flip = 1 - this.#flip)];
			interpolate(plan, (l) => ease(l, ms), out);
			for (const i of this.#entering) this.grow[i] = ease(plan.level[i], ms);
			if (this.opening) this.yearIn = easeOutCubic(Math.min(1, Math.max(0, (ms - YEAR_AT) / YEAR_FADE)));
			this.#onScreen = out;
			this.cur = out;
			if (t < 1) { this.#raf = requestAnimationFrame(step); return; }
			if (folding) this.leaving = [];
			for (const i of this.#entering) this.grow[i] = 1;
			this.#entering = new Int32Array(0);
			if (this.#reduced) this.settle = 1;
			else this.#raf = requestAnimationFrame(fade);
		};
		step(start);
	}

	stop(): void {
		cancelAnimationFrame(this.#raf);
	}
}
