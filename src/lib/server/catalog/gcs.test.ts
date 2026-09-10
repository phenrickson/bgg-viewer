import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCatalogPointer, getSignedCatalog, _resetPointerCache } from './gcs';

const POINTER = {
	hash: 'a3f9c2b1d4e5f607',
	name: 'catalog-a3f9c2b1d4e5f607.arrow.gz',
	builtAt: '2026-09-10T06:00:00.000Z',
	rows: 36044,
	bytes: 5254232
};

/** Stand-in for GCS v2 signing: deterministic in its inputs, like the real thing. */
const fakeSign = async (name: string, expires: number) =>
	`https://storage.googleapis.com/bucket/${name}?Expires=${expires}&Signature=sig-${expires}`;

const readPointer = () => Promise.resolve(Buffer.from(JSON.stringify(POINTER)));

beforeEach(() => _resetPointerCache());

describe('pointer', () => {
	it('caches within the TTL rather than reading per request', async () => {
		const read = vi.fn(readPointer);
		const clock = () => 1_000_000;
		await getCatalogPointer(clock, read);
		await getCatalogPointer(clock, read);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('re-reads once the TTL has passed', async () => {
		const read = vi.fn(readPointer);
		let now = 1_000_000;
		await getCatalogPointer(() => now, read);
		now += 61_000;
		await getCatalogPointer(() => now, read);
		expect(read).toHaveBeenCalledTimes(2);
	});
});

describe('signed url stability', () => {
	/**
	 * The one that matters. A URL derived from `now` changes on every request, so the browser
	 * can never match its cache and re-downloads ~5.25 MB every visit — strictly worse than
	 * the endpoint this replaced, while appearing to work perfectly. Anchoring to a fixed
	 * window is what makes repeat visits free, so it gets a test rather than a comment.
	 */
	it('returns a byte-identical URL for requests minutes apart', async () => {
		const base = Date.parse('2026-09-10T09:00:00.000Z');
		_resetPointerCache();
		const a = await getSignedCatalog(() => base, fakeSign, readPointer);
		_resetPointerCache();
		const b = await getSignedCatalog(() => base + 17 * 60_000, fakeSign, readPointer);
		expect(b.url).toBe(a.url);
	});

	it('returns a different URL in the next window', async () => {
		const base = Date.parse('2026-09-10T09:00:00.000Z');
		_resetPointerCache();
		const a = await getSignedCatalog(() => base, fakeSign, readPointer);
		_resetPointerCache();
		const b = await getSignedCatalog(() => base + 24 * 60 * 60 * 1000, fakeSign, readPointer);
		expect(b.url).not.toBe(a.url);
	});

	it('signs the artifact named by the pointer, not a fixed name', async () => {
		const { url, hash } = await getSignedCatalog(() => Date.parse(POINTER.builtAt), fakeSign, readPointer);
		expect(url).toContain(POINTER.name);
		expect(hash).toBe(POINTER.hash);
	});
});

describe('staleness', () => {
	it('is not stale the same day it was built', async () => {
		const { stale } = await getSignedCatalog(
			() => Date.parse(POINTER.builtAt) + 6 * 60 * 60 * 1000,
			fakeSign,
			readPointer
		);
		expect(stale).toBe(false);
	});

	/**
	 * The failure mode the event-triggered build introduces: the dispatch stops firing and
	 * nothing notices, because a stale artifact serves exactly like a fresh one.
	 */
	it('flags an artifact older than a missed daily run', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { stale } = await getSignedCatalog(
			() => Date.parse(POINTER.builtAt) + 40 * 60 * 60 * 1000,
			fakeSign,
			readPointer
		);
		expect(stale).toBe(true);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
