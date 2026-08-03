/**
 * How long to tell the user the catalog will take.
 *
 * The honest answer is "however long it took you last time". There is no server signal here
 * and there should not be: the catalog build is the only slow thing, and the client already
 * knows when it started one — it issued the fetch. A status endpoint would only answer the
 * marginal case where someone else's build is already in flight, and getting that wrong
 * makes the bar finish EARLY, which is a pleasant surprise rather than a bug.
 *
 * So: measure the real load, remember it, and quote it back next visit. First visit gets a
 * default drawn from production measurements (two cold builds at 22.33s and 22.85s — a 2%
 * spread, which is what makes any estimate here defensible at all).
 *
 * A median of the last few samples, not a mean: one pathological load — a laptop waking from
 * sleep, a throttled tab — should not poison the estimate for every subsequent visit.
 */

const KEY = 'catalog:load-samples';
const MAX_SAMPLES = 5;

/** Production cold builds measured at 22.3–22.9s; round down rather than over-promise. */
export const DEFAULT_MS = 20_000;

/** Ignore absurd samples: a backgrounded tab can report minutes and mean nothing by it. */
const PLAUSIBLE = (ms: number) => ms > 250 && ms < 120_000;

function read(): number[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const v: unknown = JSON.parse(raw);
		return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
	} catch {
		// Private mode, storage disabled, or corrupt JSON — the default is a fine answer.
		return [];
	}
}

/** Record how long a load actually took. Silently a no-op where storage is unavailable. */
export function recordLoad(ms: number): void {
	if (!PLAUSIBLE(ms)) return;
	try {
		localStorage.setItem(KEY, JSON.stringify([...read(), ms].slice(-MAX_SAMPLES)));
	} catch {
		// Not worth failing a page load over.
	}
}

/** Median of remembered loads, or the default when there is nothing to go on. */
export function estimateMs(): number {
	const s = read().slice().sort((a, b) => a - b);
	if (!s.length) return DEFAULT_MS;
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * A duration a person would say out loud. "about 20 seconds", not "about 19.4 seconds" —
 * false precision on an estimate reads as a promise, and this is not one.
 */
export function humanise(ms: number): string {
	if (ms < 1500) return 'a moment';
	const s = ms / 1000;
	if (s < 10) return `about ${Math.round(s)} seconds`;
	if (s < 90) return `about ${Math.round(s / 5) * 5} seconds`;
	return `about ${Math.round(s / 30) / 2} minutes`;
}
