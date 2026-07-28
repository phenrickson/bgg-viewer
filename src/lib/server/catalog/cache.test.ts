import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCatalogArtifact, _resetCatalogCache } from './cache';

const TTL_MS = 6 * 60 * 60 * 1000;

beforeEach(() => _resetCatalogCache());

/** A builder returning distinct bytes each call, so we can see rebuilds. */
function countingBuilder() {
	let n = 0;
	const fn = vi.fn(async () => new Uint8Array([++n]));
	return { fn };
}

describe('getCatalogArtifact', () => {
	it('builds once and serves the cache on subsequent calls', async () => {
		const { fn } = countingBuilder();
		const clock = () => 1000;
		const a = await getCatalogArtifact(fn, clock);
		const b = await getCatalogArtifact(fn, clock);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(b).toBe(a);
	});

	it('coalesces concurrent builds into one', async () => {
		const { fn } = countingBuilder();
		const clock = () => 1000;
		const [a, b] = await Promise.all([getCatalogArtifact(fn, clock), getCatalogArtifact(fn, clock)]);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it('rebuilds after the TTL expires', async () => {
		const { fn } = countingBuilder();
		let t = 1000;
		await getCatalogArtifact(fn, () => t);
		t += TTL_MS + 1;
		await getCatalogArtifact(fn, () => t);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('derives a content-hash version that changes only when bytes change', async () => {
		const a = await getCatalogArtifact(async () => new Uint8Array([1, 2, 3]), () => 1000);
		_resetCatalogCache();
		const same = await getCatalogArtifact(async () => new Uint8Array([1, 2, 3]), () => 1000);
		_resetCatalogCache();
		const diff = await getCatalogArtifact(async () => new Uint8Array([9, 9, 9]), () => 1000);
		expect(same.version).toBe(a.version);
		expect(diff.version).not.toBe(a.version);
	});
});
