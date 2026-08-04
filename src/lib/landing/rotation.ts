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
 * Pick from `list` by day, with `offset` stepping the user forward/back through the set.
 *
 * Modulo is written the long way because JS `%` keeps the sign of the dividend, so a
 * negative offset (strolling backwards on day 0 of the list) would index out of bounds.
 */
export function pick<T>(list: readonly T[], day: number, offset = 0): T | null {
	if (list.length === 0) return null;
	const i = (((day + offset) % list.length) + list.length) % list.length;
	return list[i];
}
