/**
 * A value loaded at most once per TTL, shared by every caller, that keeps serving the last
 * good value (marked `stale`) when a reload fails.
 *
 * Why not `artifact-cache.ts`: that caches gzipped bytes with a disk mirror. This holds plain
 * objects, and adds the stale fallback: the BGG.CON page must keep showing the last known
 * availability when Tabletop.Events is slow or down, rather than going blank.
 *
 * Loads only when asked (no timer): Cloud Run throttles CPU between requests, so a background
 * poll wouldn't run anyway, and nobody looking means no upstream requests.
 */
export interface TtlResult<T> {
	value: T;
	/** When `value` was loaded (clock ms). */
	at: number;
	/** True when a reload failed and this is the previous value. */
	stale: boolean;
}

export interface TtlValueOptions<T> {
	ttlMs: number;
	load: () => Promise<T>;
	clock?: () => number;
}

export function createTtlValue<T>({ ttlMs, load, clock = Date.now }: TtlValueOptions<T>) {
	let last: { value: T; at: number } | null = null;
	/** When we last tried, success or not: a failed reload also waits out a TTL. */
	let triedAt = -Infinity;
	let stale = false;
	let inflight: Promise<TtlResult<T>> | null = null;

	function get(): Promise<TtlResult<T>> {
		if (last && clock() - triedAt < ttlMs) return Promise.resolve({ ...last, stale });
		if (inflight) return inflight;

		const started = clock();
		inflight = load()
			.then(
				(value) => {
					last = { value, at: started };
					triedAt = started;
					stale = false;
					return { ...last, stale };
				},
				(e) => {
					if (!last) throw e; // nothing to fall back to; the next call retries
					console.error('[bggcon] reload failed, serving the last good value:', e);
					triedAt = started;
					stale = true;
					return { ...last, stale };
				}
			)
			.finally(() => {
				inflight = null;
			});
		return inflight;
	}

	return { get };
}
