/** In-process cache of the tour's neighbours artifact — same factory as the coordinates. */
import { createArtifactCache, type ArtifactDisk, type CachedArtifact } from '../artifact-cache';
import { buildNeighboursArtifact } from './build';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Gitignored; beside the coordinates' disk mirror. */
export const CACHE_PATH = '.cache/neighbours.json.gz';

const artifactCache = createArtifactCache({ cachePath: CACHE_PATH, ttlMs: TTL_MS, label: 'neighbours' });

export function getNeighboursArtifact(
	builder: () => Promise<Uint8Array> = buildNeighboursArtifact,
	clock: () => number = Date.now,
	disk?: ArtifactDisk,
	offline?: () => boolean
): Promise<CachedArtifact> {
	return artifactCache.getArtifact(builder, clock, disk, offline);
}

/** Test seam. */
export function _resetNeighboursCache(): void {
	artifactCache.reset();
}
