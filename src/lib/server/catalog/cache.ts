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
 */
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildCatalogArtifact } from './build';
import { isOffline } from '../offline';

export interface CatalogArtifact {
	/** gzip-encoded Arrow IPC — served as-is with `content-encoding: gzip`. */
	body: Uint8Array;
	/** Content hash of the *uncompressed* Arrow — stable when data is unchanged (ETag). */
	version: string;
	builtAt: number;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h; warehouse data changes ~daily

/** Gitignored; sits beside the other build artifacts rather than in the source tree. */
export const CACHE_PATH = '.cache/catalog.arrow.gz';

/**
 * Filesystem seam. Tests substitute an in-memory pair so they never touch real files, and
 * so "no cache on disk" is expressible without arranging for a missing path.
 */
export interface CatalogDisk {
	read(path: string): Uint8Array;
	write(path: string, bytes: Uint8Array): void;
}

const realDisk: CatalogDisk = {
	read: (path) => readFileSync(path),
	write: (path, bytes) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, bytes);
	}
};

let cached: CatalogArtifact | null = null;
let inflight: Promise<CatalogArtifact> | null = null;

/** Hash the *uncompressed* bytes, so the version tracks data rather than gzip's output. */
const versionOf = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex').slice(0, 16);

async function build(
	builder: () => Promise<Uint8Array>,
	clock: () => number,
	disk: CatalogDisk
): Promise<CatalogArtifact> {
	const raw = await builder();
	const artifact = { body: gzipSync(raw), version: versionOf(raw), builtAt: clock() };

	// Best-effort mirror: a disk that won't take the write is not a reason to fail a request
	// that already has the bytes in hand. Offline mode is what depends on this, and it can
	// only be entered deliberately, after a successful online run.
	try {
		disk.write(CACHE_PATH, artifact.body);
	} catch {
		// Intentionally silent — see above.
	}
	return artifact;
}

/**
 * Serve the artifact mirrored to disk by an earlier online run. Stored gzipped, exactly as
 * the endpoint sends it, so the happy path is a straight read; the gunzip here exists only
 * to recover the version hash, which is defined over the uncompressed bytes.
 */
function readFromDisk(clock: () => number, disk: CatalogDisk): CatalogArtifact {
	let body: Uint8Array;
	try {
		body = disk.read(CACHE_PATH);
	} catch {
		throw new Error(
			`OFFLINE is set but no cached catalog exists at ${CACHE_PATH}. ` +
				'Run once with network access to populate it.'
		);
	}
	return { body, version: versionOf(gunzipSync(body)), builtAt: clock() };
}

/**
 * Get the current artifact, (re)building if stale. `builder`/`clock`/`disk` are injectable
 * for tests; production uses BigQuery, the real clock, and the real filesystem.
 *
 * In offline mode the disk mirror is the only source — the TTL is ignored, because a stale
 * catalog is the whole point and there is no network to refresh it from.
 */
export function getCatalogArtifact(
	builder: () => Promise<Uint8Array> = buildCatalogArtifact,
	clock: () => number = Date.now,
	disk: CatalogDisk = realDisk,
	offline: () => boolean = isOffline
): Promise<CatalogArtifact> {
	if (cached && (offline() || clock() - cached.builtAt < TTL_MS)) return Promise.resolve(cached);
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

/** Test seam. */
export function _resetCatalogCache(): void {
	cached = null;
	inflight = null;
}
