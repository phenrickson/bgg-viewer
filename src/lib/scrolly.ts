/**
 * `use:scrolly` — Scrollama (The Pudding's scrollytelling library) as a Svelte action. The
 * node is the container of the steps; `step` selects them within it. Scrollama owns the
 * trigger line (`offset`, a fraction of the viewport), enter/exit with direction, per-step
 * progress, and resize — everything a hand-rolled IntersectionObserver gets wrong first.
 *
 * The app shell scrolls `main.content`, not the window, so callers pass that element as
 * `root`: Scrollama's observers then measure against it. (`root`/`container` are in
 * Scrollama's source but not its typings, hence the cast.)
 */
import type { Action } from 'svelte/action';
import scrollama from 'scrollama';

export interface ScrollyOptions {
	/** Selector for the step elements inside the node. */
	step: string;
	/** Where the trigger line sits, 0 (top) – 1 (bottom) of the viewport. Default 0.5. */
	offset?: number;
	/** Report progress through each step (0–1); costs a second observer per step. */
	progress?: boolean;
	/** The scroll container, when it isn't the window. */
	root?: HTMLElement | null;
	onEnter?: (index: number, direction: 'up' | 'down') => void;
	onExit?: (index: number, direction: 'up' | 'down') => void;
	onProgress?: (index: number, progress: number) => void;
	debug?: boolean;
}

export const scrolly: Action<HTMLElement, ScrollyOptions> = (node, options) => {
	let instance: ReturnType<typeof scrollama> | null = null;
	let ro: ResizeObserver | null = null;

	function setup(o: ScrollyOptions) {
		instance?.destroy();
		instance = scrollama();
		instance
			.setup({
				step: Array.from(node.querySelectorAll<HTMLElement>(o.step)),
				offset: (o.offset ?? 0.5) as scrollama.DecimalType,
				progress: o.progress ?? false,
				debug: o.debug ?? false,
				root: o.root ?? null,
				container: o.root ?? undefined
			} as scrollama.ScrollamaOptions)
			.onStepEnter(({ index, direction }) => o.onEnter?.(index, direction))
			.onStepExit(({ index, direction }) => o.onExit?.(index, direction))
			.onStepProgress(({ index, progress }) => o.onProgress?.(index, progress));
	}

	setup(options);
	// Scrollama recomputes its margins on window resize only; the column can also change
	// width (and so height) when the sidebar or the map resize it.
	ro = new ResizeObserver(() => instance?.resize());
	ro.observe(node);

	return {
		update(o) {
			setup(o);
		},
		destroy() {
			ro?.disconnect();
			instance?.destroy();
		}
	};
};
