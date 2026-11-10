/**
 * The vectors artifact's in-process + disk cache, for the BigQuery fallback path (see
 * `/api/vectors`). Same shape as the coordinates cache.
 */
import { createArtifactCache, type ArtifactDisk, type CachedArtifact } from '../artifact-cache';
import { buildVectorsArtifact } from './build';

export type VectorsArtifact = CachedArtifact;

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export const CACHE_PATH = '.cache/vectors.arrow.gz';

const artifactCache = createArtifactCache({ cachePath: CACHE_PATH, ttlMs: TTL_MS, label: 'vectors' });

export function getVectorsArtifact(
	builder: () => Promise<Uint8Array> = () => buildVectorsArtifact(),
	clock: () => number = Date.now,
	disk?: ArtifactDisk,
	offline?: () => boolean
): Promise<VectorsArtifact> {
	return artifactCache.getArtifact(builder, clock, disk, offline);
}

export function _resetVectorsCache(): void {
	artifactCache.reset();
}
