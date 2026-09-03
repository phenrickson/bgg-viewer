/**
 * In-process TTL cache for the dev-only similarity-explorer artifact. Same machinery as
 * `catalog/cache.ts` and `thumbnails/cache.ts` (build once per TTL, coalesce concurrent
 * builds, mirror to disk). The TTL is long because this feeds hand tuning, not a live page —
 * the underlying embeddings only change when the model is refit.
 */
import { createArtifactCache, type CachedArtifact } from '../artifact-cache';
import { buildSimilarExplorerArtifact } from './build';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h — dev tuning artifact, not user-facing

/** Gitignored; sits beside the other build artifacts. */
export const CACHE_PATH = '.cache/similar-explorer.arrow.gz';

const artifactCache = createArtifactCache({
	cachePath: CACHE_PATH,
	ttlMs: TTL_MS,
	label: 'similar-explorer'
});

export function getSimilarExplorerArtifact(
	builder: () => Promise<Uint8Array> = buildSimilarExplorerArtifact,
	clock: () => number = Date.now
): Promise<CachedArtifact> {
	return artifactCache.getArtifact(builder, clock);
}

/** Test seam. */
export function _resetSimilarExplorerCache(): void {
	artifactCache.reset();
}
