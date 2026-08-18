/**
 * In-process TTL cache for a server-built artifact, with a disk mirror for offline mode.
 * Extracted from `catalog/cache.ts` once thumbnails needed the identical shape (build at
 * most once per TTL, coalesce concurrent builds, mirror to disk, ignore TTL when offline) —
 * see that module and `thumbnails/cache.ts` for the two callers.
 */
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isOffline } from './offline';

export interface CachedArtifact {
	/** gzip-encoded bytes — served as-is with `content-encoding: gzip`. */
	body: Uint8Array;
	/** Content hash of the *uncompressed* bytes (ETag); stable when the data is unchanged. */
	version: string;
	builtAt: number;
}

/** Filesystem seam. Tests substitute an in-memory pair so they never touch real files. */
export interface ArtifactDisk {
	read(path: string): Uint8Array;
	write(path: string, bytes: Uint8Array): void;
}

export const realDisk: ArtifactDisk = {
	read: (path) => readFileSync(path),
	write: (path, bytes) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, bytes);
	}
};

const versionOf = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex').slice(0, 16);

export interface ArtifactCacheOptions {
	/** Gitignored path this artifact mirrors to, e.g. `.cache/thumbnails.arrow.gz`. */
	cachePath: string;
	ttlMs: number;
	/** Name used in the offline "nothing mirrored yet" error, e.g. "catalog" or "thumbnails". */
	label: string;
}

/** One cache instance per artifact — each caller gets its own `cached`/`inflight` state. */
export function createArtifactCache({ cachePath, ttlMs, label }: ArtifactCacheOptions) {
	let cached: CachedArtifact | null = null;
	let inflight: Promise<CachedArtifact> | null = null;

	async function build(
		builder: () => Promise<Uint8Array>,
		clock: () => number,
		disk: ArtifactDisk
	): Promise<CachedArtifact> {
		const raw = await builder();
		const artifact = { body: gzipSync(raw), version: versionOf(raw), builtAt: clock() };

		// Best-effort mirror: a disk that won't take the write is not a reason to fail a
		// request that already has the bytes in hand.
		try {
			disk.write(cachePath, artifact.body);
		} catch {
			// Intentionally silent — see above.
		}
		return artifact;
	}

	/**
	 * Stored gzipped, exactly as the endpoint sends it, so the happy path is a straight
	 * read; the gunzip here exists only to recover the version hash, defined over the
	 * uncompressed bytes.
	 */
	function readFromDisk(clock: () => number, disk: ArtifactDisk): CachedArtifact {
		let body: Uint8Array;
		try {
			body = disk.read(cachePath);
		} catch {
			throw new Error(
				`OFFLINE is set but no cached ${label} exists at ${cachePath}. ` +
					'Run once with network access to populate it.'
			);
		}
		return { body, version: versionOf(gunzipSync(body)), builtAt: clock() };
	}

	/**
	 * Get the current artifact, (re)building if stale. `builder`/`clock`/`disk` are
	 * injectable for tests; production uses the real builder, the real clock, and the real
	 * filesystem.
	 *
	 * In offline mode the disk mirror is the only source — the TTL is ignored, because a
	 * stale artifact is the whole point and there is no network to refresh it from.
	 */
	function getArtifact(
		builder: () => Promise<Uint8Array>,
		clock: () => number = Date.now,
		disk: ArtifactDisk = realDisk,
		offline: () => boolean = isOffline
	): Promise<CachedArtifact> {
		if (cached && (offline() || clock() - cached.builtAt < ttlMs)) return Promise.resolve(cached);
		if (inflight) return inflight;

		if (offline()) {
			try {
				cached = readFromDisk(clock, disk);
				return Promise.resolve(cached);
			} catch (e) {
				return Promise.reject(e);
			}
		}

		inflight = build(builder, clock, disk)
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

	function reset(): void {
		cached = null;
		inflight = null;
	}

	return { getArtifact, reset };
}
