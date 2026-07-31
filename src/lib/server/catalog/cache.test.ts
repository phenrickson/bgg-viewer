import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { getCatalogArtifact, _resetCatalogCache, CACHE_PATH, type CatalogDisk } from './cache';

const TTL_MS = 6 * 60 * 60 * 1000;

beforeEach(() => _resetCatalogCache());

/** A builder returning distinct bytes each call, so we can see rebuilds. */
function countingBuilder() {
	let n = 0;
	const fn = vi.fn(async () => new Uint8Array([++n]));
	return { fn };
}

/**
 * In-memory stand-in for the filesystem, so these tests never touch real files and an
 * empty disk is expressible without arranging for a missing path.
 */
function memDisk(seed?: Record<string, Uint8Array>) {
	const files = new Map<string, Uint8Array>(Object.entries(seed ?? {}));
	const disk: CatalogDisk = {
		read: (path) => {
			const f = files.get(path);
			if (!f) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
			return f;
		},
		write: (path, bytes) => void files.set(path, bytes)
	};
	return { disk, files };
}

const online = () => false;
const offline = () => true;

describe('getCatalogArtifact', () => {
	it('builds once and serves the cache on subsequent calls', async () => {
		const { fn } = countingBuilder();
		const { disk } = memDisk();
		const clock = () => 1000;
		const a = await getCatalogArtifact(fn, clock, disk, online);
		const b = await getCatalogArtifact(fn, clock, disk, online);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(b).toBe(a);
	});

	it('coalesces concurrent builds into one', async () => {
		const { fn } = countingBuilder();
		const { disk } = memDisk();
		const clock = () => 1000;
		const [a, b] = await Promise.all([
			getCatalogArtifact(fn, clock, disk, online),
			getCatalogArtifact(fn, clock, disk, online)
		]);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it('rebuilds after the TTL expires', async () => {
		const { fn } = countingBuilder();
		const { disk } = memDisk();
		let t = 1000;
		await getCatalogArtifact(fn, () => t, disk, online);
		t += TTL_MS + 1;
		await getCatalogArtifact(fn, () => t, disk, online);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('derives a content-hash version that changes only when bytes change', async () => {
		const { disk } = memDisk();
		const a = await getCatalogArtifact(async () => new Uint8Array([1, 2, 3]), () => 1000, disk, online);
		_resetCatalogCache();
		const same = await getCatalogArtifact(async () => new Uint8Array([1, 2, 3]), () => 1000, disk, online);
		_resetCatalogCache();
		const diff = await getCatalogArtifact(async () => new Uint8Array([9, 9, 9]), () => 1000, disk, online);
		expect(same.version).toBe(a.version);
		expect(diff.version).not.toBe(a.version);
	});

	it('mirrors a successful build to disk, gzipped as the endpoint serves it', async () => {
		const { disk, files } = memDisk();
		const raw = new Uint8Array([1, 2, 3]);
		await getCatalogArtifact(async () => raw, () => 1000, disk, online);
		const written = files.get(CACHE_PATH);
		expect(written).toBeDefined();
		expect(gunzipSync(written!)).toEqual(Buffer.from(raw));
	});

	it('still serves the request when the disk mirror fails', async () => {
		const disk: CatalogDisk = {
			read: () => {
				throw new Error('nope');
			},
			write: () => {
				throw new Error('read-only disk');
			}
		};
		const a = await getCatalogArtifact(async () => new Uint8Array([7]), () => 1000, disk, online);
		expect(a.version).toBeTruthy();
	});
});

describe('getCatalogArtifact — offline', () => {
	it('serves the mirrored artifact without calling the builder', async () => {
		const { fn } = countingBuilder();
		const { disk, files } = memDisk();

		// One online build to populate the mirror, then re-enter cold and offline.
		await getCatalogArtifact(fn, () => 1000, disk, online);
		const mirrored = files.get(CACHE_PATH)!;
		_resetCatalogCache();
		fn.mockClear();

		const a = await getCatalogArtifact(fn, () => 2000, disk, offline);
		expect(fn).not.toHaveBeenCalled();
		expect(a.body).toEqual(mirrored);
	});

	it('reports the version the online build derived, so the ETag matches', async () => {
		const { disk } = memDisk();
		const raw = new Uint8Array([4, 5, 6]);
		const built = await getCatalogArtifact(async () => raw, () => 1000, disk, online);
		_resetCatalogCache();

		const fromDisk = await getCatalogArtifact(async () => new Uint8Array([0]), () => 2000, disk, offline);
		expect(fromDisk.version).toBe(built.version);
	});

	it('ignores the TTL — a stale catalog is the point, and there is nothing to refresh from', async () => {
		const { fn } = countingBuilder();
		const { disk } = memDisk();
		let t = 1000;
		await getCatalogArtifact(fn, () => t, disk, online);
		fn.mockClear();

		t += TTL_MS * 10;
		await getCatalogArtifact(fn, () => t, disk, offline);
		expect(fn).not.toHaveBeenCalled();
	});

	it('fails with an actionable message when nothing has been mirrored yet', async () => {
		const { fn } = countingBuilder();
		const { disk } = memDisk();
		await expect(getCatalogArtifact(fn, () => 1000, disk, offline)).rejects.toThrow(
			/OFFLINE is set but no cached catalog/
		);
		expect(fn).not.toHaveBeenCalled();
	});
});
