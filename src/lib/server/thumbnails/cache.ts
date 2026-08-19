/**
 * In-process cache of the thumbnails artifact — same shape as `catalog/cache.ts`, built on
 * the shared `../artifact-cache` factory. A longer TTL than the catalog's: box art barely
 * ever changes for a given game, unlike ratings, so there is no reason to rebuild this as
 * often.
 */
import { createArtifactCache, type ArtifactDisk, type CachedArtifact } from '../artifact-cache';
import { buildThumbnailsArtifact } from './build';

export type ThumbnailsArtifact = CachedArtifact;

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Gitignored; sits beside the catalog's own disk mirror. */
export const CACHE_PATH = '.cache/thumbnails.arrow.gz';

const artifactCache = createArtifactCache({ cachePath: CACHE_PATH, ttlMs: TTL_MS, label: 'thumbnails' });

export function getThumbnailsArtifact(
	builder: () => Promise<Uint8Array> = buildThumbnailsArtifact,
	clock: () => number = Date.now,
	disk?: ArtifactDisk,
	offline?: () => boolean
): Promise<ThumbnailsArtifact> {
	return artifactCache.getArtifact(builder, clock, disk, offline);
}

/** Test seam. */
export function _resetThumbnailsCache(): void {
	artifactCache.reset();
}
