/**
 * In-process cache of the catalog artifact. Built at most once per TTL (data refreshes
 * daily), served instantly after that. Concurrent requests during a (re)build coalesce
 * onto a single in-flight build, and the cached reference is swapped atomically.
 *
 * Under scale-to-zero this rebuilds on cold start — cheap, and the point: no BigQuery
 * scan per request.
 *
 * A successful build is also mirrored to disk so local offline mode has something to serve
 * on a cold start, when the in-process cache is empty and BigQuery is unreachable. That
 * mirror is the *only* purpose of the file: a game click offline is answered from the copy
 * the browser already holds in DuckDB, never by re-reading this.
 *
 * The TTL/coalescing/disk-mirror machinery itself lives in `../artifact-cache` — shared
 * with `thumbnails/cache.ts`, which needs the identical shape for a second artifact.
 */
import { createArtifactCache, type ArtifactDisk, type CachedArtifact } from '../artifact-cache';
import { buildCatalogArtifact } from './build';

export type CatalogArtifact = CachedArtifact;
/** Re-exported so existing imports of `CatalogDisk` from this module keep working. */
export type CatalogDisk = ArtifactDisk;

const TTL_MS = 6 * 60 * 60 * 1000; // 6h; warehouse data changes ~daily

/** Gitignored; sits beside the other build artifacts rather than in the source tree. */
export const CACHE_PATH = '.cache/catalog.arrow.gz';

const artifactCache = createArtifactCache({ cachePath: CACHE_PATH, ttlMs: TTL_MS, label: 'catalog' });

export function getCatalogArtifact(
	builder: () => Promise<Uint8Array> = buildCatalogArtifact,
	clock: () => number = Date.now,
	disk?: ArtifactDisk,
	offline?: () => boolean
): Promise<CatalogArtifact> {
	return artifactCache.getArtifact(builder, clock, disk, offline);
}

/** Test seam. */
export function _resetCatalogCache(): void {
	artifactCache.reset();
}
