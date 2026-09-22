/**
 * In-process cache of the coordinates artifact — same shape as `thumbnails/cache.ts`, on the
 * shared `../artifact-cache` factory. Coordinates only change when a game is re-embedded
 * (daily, a few dozen games) or the model is bumped (rarely), so a day of staleness is fine.
 */
import { createArtifactCache, type ArtifactDisk, type CachedArtifact } from '../artifact-cache';
import { buildCoordinatesArtifact } from './build';

export type CoordinatesArtifact = CachedArtifact;

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Gitignored; sits beside the catalog's and thumbnails' disk mirrors. */
export const CACHE_PATH = '.cache/coordinates.arrow.gz';

const artifactCache = createArtifactCache({ cachePath: CACHE_PATH, ttlMs: TTL_MS, label: 'coordinates' });

export function getCoordinatesArtifact(
	builder: () => Promise<Uint8Array> = buildCoordinatesArtifact,
	clock: () => number = Date.now,
	disk?: ArtifactDisk,
	offline?: () => boolean
): Promise<CoordinatesArtifact> {
	return artifactCache.getArtifact(builder, clock, disk, offline);
}

/** Test seam. */
export function _resetCoordinatesCache(): void {
	artifactCache.reset();
}
