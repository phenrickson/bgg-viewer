/**
 * Which viz and which game today gets — decided on the client from the date, with no server
 * involved and nothing stored.
 *
 * Rotation is by *day*, not per load: a user who reloads three times during one warm gap
 * should see the same thing each time, or the page reads as slot-machine rather than
 * editorial. Reloading is also the most likely thing they do while waiting.
 */

const MS_PER_DAY = 86_400_000;

/** Whole days since the epoch. Local-clock based; a wrong clock costs a different viz. */
export function dayIndex(now: number = Date.now()): number {
	return Math.floor(now / MS_PER_DAY);
}

/**
 * A pseudo-random position in [0, n), deterministic from `day` alone — a sine-hash rather
 * than `Math.random` (same technique Scatter.svelte's jitter uses for its own reproducible
 * "randomness"), so it needs no seeded-RNG library and no state carried across reloads: the
 * same day always hashes to the same start.
 */
function seededStart(day: number, n: number): number {
	const s = Math.sin(day * 12.9898 + 78.233) * 43758.5453;
	return Math.floor((s - Math.floor(s)) * n);
}

/**
 * Pick from `list` by day, with `offset` stepping the user forward/back through the set.
 *
 * The day's OWN starting position in the list is hashed, not the day number used directly
 * as the index — using `day` itself made the walk through the list perfectly sequential
 * (day N always the item after day N-1's), so with vizzes ordered by their source filename's
 * numeric prefix, the rotation always advanced through them in that same fixed order, one
 * step a day, forever. Hashing the start decouples "which day" from "which position" while
 * keeping every other property: still stable across reloads within a day (same `day` in,
 * same start out), and `offset` still walks the list in a normal, browsable order via the
 * prev/next buttons once a day's start is picked.
 *
 * Modulo is written the long way because JS `%` keeps the sign of the dividend, so a
 * negative offset (strolling backwards from a start near 0) would index out of bounds.
 */
export function pick<T>(list: readonly T[], day: number, offset = 0): T | null {
	if (list.length === 0) return null;
	const start = seededStart(day, list.length);
	const i = (((start + offset) % list.length) + list.length) % list.length;
	return list[i];
}
