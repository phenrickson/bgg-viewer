/**
 * Trailing-edge debounce, for scope changes that drive an expensive query.
 *
 * Most of the catalog's per-scope work is a `COUNT(*)` — one row, cheap enough that
 * `/games` runs it on every keystroke without anyone noticing. The map's is not: it reads a
 * `game_id` column of up to ~30k rows and walks it to build a per-point mask, which is fine
 * once per deliberate filter change and ruinous once per character typed into a name search.
 *
 * Trailing edge rather than leading: the first character of "cosmic" is not a query anyone
 * wants answered, and the last one is. `cancel` exists so an effect's teardown doesn't fire
 * a query for a component that has gone away.
 */

export interface Debounced<A extends unknown[]> {
	(...args: A): void;
	/** Drop a pending call without running it. */
	cancel(): void;
}

/** Wrap `fn` so it runs `ms` after the last call, not on every one. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const wrapped = (...args: A) => {
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			fn(...args);
		}, ms);
	};
	wrapped.cancel = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	};
	return wrapped;
}

/**
 * How long the map waits before re-querying the scope.
 *
 * Long enough to swallow a burst of typing, short enough that clicking a category still
 * feels like a direct response. Discrete controls (a segment, a checkbox) arrive one at a
 * time, so for them this is a flat ~120ms of latency rather than a saving — which is the
 * right trade while the same code path also serves a text input.
 */
export const SCOPE_DEBOUNCE_MS = 120;
