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
 * A 32-bit integer hash of `n`, well-mixed enough that consecutive inputs land nowhere near
 * each other (mulberry32's mixing step). Seeds the day's shuffle, so consecutive days get
 * unrelated orderings rather than orderings derived from adjacent raw day numbers.
 */
function hash(n: number): number {
	let h = (n + 0x6d2b79f5) | 0;
	h = Math.imul(h ^ (h >>> 15), h | 1);
	h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
	return (h ^ (h >>> 14)) >>> 0;
}

/** A [0,1) PRNG seeded by `seed`, deterministic and self-contained (mulberry32). */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), a | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The day's own ordering of `list` — a Fisher-Yates shuffle seeded by the day alone.
 *
 * Hashing only the *starting position* into a list left in source order (what this used to do)
 * fixed which item a day began on but not what followed it: the two slots on one page are one
 * step apart, so they always drew neighbouring entries, and the prev/next buttons walked the
 * vizzes in `scripts/vizzes/` filename order — visibly "01, 02, 03" rather than a rotation.
 * Shuffling the list itself decouples position N from position N+1, so adjacent slots and a
 * browsing stroll both get an order that is different every day.
 */
function dayOrder<T>(list: readonly T[], day: number): readonly T[] {
	const out = list.slice();
	const rand = rng(hash(day));
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Pick from `list` by day, with `offset` stepping the user forward/back through the set.
 *
 * The list is shuffled into a per-day order first (see `dayOrder`), then indexed by `offset`
 * from its head. Every property the callers rely on holds: stable across reloads within a day
 * (same `day` in, same shuffle out), and `offset` still walks a normal, browsable sequence via
 * the prev/next buttons — it is just no longer the source file order.
 *
 * Modulo is written the long way because JS `%` keeps the sign of the dividend, so a
 * negative offset (strolling backwards from the head) would index out of bounds.
 */
export function pick<T>(list: readonly T[], day: number, offset = 0): T | null {
	if (list.length === 0) return null;
	const order = dayOrder(list, day);
	const i = ((offset % order.length) + order.length) % order.length;
	return order[i];
}
