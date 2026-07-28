/**
 * In-process cache of the catalog artifact. Built at most once per TTL (data refreshes
 * daily), served instantly after that. Concurrent requests during a (re)build coalesce
 * onto a single in-flight build, and the cached reference is swapped atomically.
 *
 * Under scale-to-zero this rebuilds on cold start — cheap, and the point: no BigQuery
 * scan per request.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { buildCatalogArtifact } from './build';

export interface CatalogArtifact {
	/** gzip-encoded Arrow IPC — served as-is with `content-encoding: gzip`. */
	body: Uint8Array;
	/** Content hash of the *uncompressed* Arrow — stable when data is unchanged (ETag). */
	version: string;
	builtAt: number;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h; warehouse data changes ~daily

let cached: CatalogArtifact | null = null;
let inflight: Promise<CatalogArtifact> | null = null;

async function build(
	builder: () => Promise<Uint8Array>,
	clock: () => number
): Promise<CatalogArtifact> {
	const raw = await builder();
	const version = createHash('sha256').update(raw).digest('hex').slice(0, 16);
	return { body: gzipSync(raw), version, builtAt: clock() };
}

/**
 * Get the current artifact, (re)building if stale. `builder`/`clock` are injectable for
 * tests; production uses BigQuery + the real clock.
 */
export function getCatalogArtifact(
	builder: () => Promise<Uint8Array> = buildCatalogArtifact,
	clock: () => number = Date.now
): Promise<CatalogArtifact> {
	if (cached && clock() - cached.builtAt < TTL_MS) return Promise.resolve(cached);
	if (inflight) return inflight;
	inflight = build(builder, clock)
		.then((a) => {
			cached = a; // atomic swap
			inflight = null;
			return a;
		})
		.catch((e) => {
			inflight = null;
			throw e;
		});
	return inflight;
}

/** Test seam. */
export function _resetCatalogCache(): void {
	cached = null;
	inflight = null;
}
