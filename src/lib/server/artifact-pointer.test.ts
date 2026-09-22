/**
 * The catalog's own `catalog/gcs.test.ts` still covers the window/staleness behaviour
 * end-to-end through the catalog's names, and passing unmodified is what proves the
 * extraction changed nothing. These tests cover what only the *factory* can be wrong about:
 * per-instance isolation, and the two properties a second artifact could silently lose.
 */
import { describe, it, expect, vi } from 'vitest';

/**
 * Mocked so the v2-signing test can exercise the module's own default signer rather than a
 * stand-in passed into it. Every other test here injects its seams and never reaches this.
 */
const getSignedUrl = vi.fn(async (_opts: Record<string, unknown>) => ['https://signed.example/x']);
const download = vi.fn(async () => [
	Buffer.from(
		JSON.stringify({
			hash: 'aaaaaaaaaaaaaaaa',
			name: 'thing-aaaaaaaaaaaaaaaa.arrow.gz',
			builtAt: '2026-09-22T06:00:00.000Z',
			rows: 36_277,
			bytes: 1_838_566
		})
	)
]);

vi.mock('@google-cloud/storage', () => ({
	Storage: class {
		bucket() {
			return { file: () => ({ getSignedUrl, download }) };
		}
	}
}));

import { createArtifactPointer } from './artifact-pointer';

const pointerFor = (hash: string, builtAt = '2026-09-22T06:00:00.000Z') => ({
	hash,
	name: `thing-${hash}.arrow.gz`,
	builtAt,
	rows: 36_277,
	bytes: 1_838_566
});

const readerFor = (hash: string, builtAt?: string) => () =>
	Promise.resolve(Buffer.from(JSON.stringify(pointerFor(hash, builtAt))));

const fakeSign = async (name: string, expires: number) =>
	`https://storage.googleapis.com/bucket/${name}?Expires=${expires}`;

describe('per-instance isolation', () => {
	/**
	 * The reason this is a factory at all. Before the extraction the pointer cache was a
	 * module-level singleton, so a second artifact importing the same module would have been
	 * served whichever pointer happened to be read first — for a full TTL, with no error.
	 * That fails as a 404 at best and as the wrong bytes in the right table at worst.
	 */
	it('does not let one artifact serve another artifact hash', async () => {
		const clock = () => 1_000_000;
		const catalog = createArtifactPointer({ pointerName: 'catalog-current.json', label: 'catalog' });
		const thumbnails = createArtifactPointer({
			pointerName: 'thumbnails-current.json',
			label: 'thumbnails'
		});

		const a = await catalog.getPointer(clock, readerFor('aaaaaaaaaaaaaaaa'));
		const b = await thumbnails.getPointer(clock, readerFor('bbbbbbbbbbbbbbbb'));

		expect(a.hash).toBe('aaaaaaaaaaaaaaaa');
		expect(b.hash).toBe('bbbbbbbbbbbbbbbb');
	});

	it('gives each instance its own TTL, so one read does not satisfy the other', async () => {
		const clock = () => 1_000_000;
		const one = createArtifactPointer({ pointerName: 'one.json', label: 'one' });
		const two = createArtifactPointer({ pointerName: 'two.json', label: 'two' });
		const read = vi.fn(readerFor('aaaaaaaaaaaaaaaa'));

		await one.getPointer(clock, read);
		await two.getPointer(clock, read);

		expect(read).toHaveBeenCalledTimes(2);
	});

	it('resets one instance without resetting the other', async () => {
		const clock = () => 1_000_000;
		const one = createArtifactPointer({ pointerName: 'one.json', label: 'one' });
		const two = createArtifactPointer({ pointerName: 'two.json', label: 'two' });
		const read = vi.fn(readerFor('aaaaaaaaaaaaaaaa'));

		await one.getPointer(clock, read);
		await two.getPointer(clock, read);
		one.reset();
		await one.getPointer(clock, read);
		await two.getPointer(clock, read);

		expect(read).toHaveBeenCalledTimes(3); // one re-read; two still cached
	});
});

describe('signing', () => {
	/**
	 * v2, not v4. A v4 URL embeds `X-Goog-Date`, so its string changes on every call and the
	 * browser can never match its cache entry — which makes the whole signed-URL design
	 * strictly worse than the endpoint it replaces while appearing to work perfectly. The
	 * default signer is the only place that choice is made, so it is asserted rather than
	 * left to a comment that a library upgrade or a "fix the deprecation" edit could undo.
	 */
	it('asks GCS for a v2 signature', async () => {
		// No `sign` or `read` seam here, deliberately: the version is chosen in the DEFAULT
		// signer, so injecting a stand-in would only test the stand-in. This drives the real
		// code path against a mocked `@google-cloud/storage`.
		const instance = createArtifactPointer({ pointerName: 'p.json', label: 'p' });
		await instance.getSignedArtifact(() => Date.parse('2026-09-22T09:00:00.000Z'));

		expect(getSignedUrl).toHaveBeenCalledWith(
			expect.objectContaining({ version: 'v2', action: 'read' })
		);
	});

	it('hands out the same expiry — so the same URL — across one 24h window', async () => {
		const DAY = 24 * 60 * 60 * 1000;
		const start = Math.floor(Date.parse('2026-09-22T00:00:00.000Z') / DAY) * DAY;
		const instance = createArtifactPointer({ pointerName: 'p.json', label: 'p' });

		const urls: string[] = [];
		for (const offset of [0, 1, DAY / 2, DAY - 1]) {
			instance.reset();
			const { url } = await instance.getSignedArtifact(
				() => start + offset,
				fakeSign,
				readerFor('aaaaaaaaaaaaaaaa')
			);
			urls.push(url);
		}

		expect(new Set(urls).size).toBe(1);
	});

	it('rolls over exactly at the window boundary', async () => {
		const DAY = 24 * 60 * 60 * 1000;
		const start = Math.floor(Date.parse('2026-09-22T00:00:00.000Z') / DAY) * DAY;
		const instance = createArtifactPointer({ pointerName: 'p.json', label: 'p' });

		instance.reset();
		const last = (
			await instance.getSignedArtifact(() => start + DAY - 1, fakeSign, readerFor('aaaaaaaaaaaaaaaa'))
		).url;
		instance.reset();
		const first = (
			await instance.getSignedArtifact(() => start + DAY, fakeSign, readerFor('aaaaaaaaaaaaaaaa'))
		).url;

		expect(first).not.toBe(last);
	});
});

describe('staleness', () => {
	const BUILT = '2026-09-22T06:00:00.000Z';

	it('is not stale within a normal daily cadence', async () => {
		const instance = createArtifactPointer({ pointerName: 'p.json', label: 'p' });
		const { stale } = await instance.getSignedArtifact(
			() => Date.parse(BUILT) + 6 * 60 * 60 * 1000,
			fakeSign,
			readerFor('aaaaaaaaaaaaaaaa', BUILT)
		);
		expect(stale).toBe(false);
	});

	/**
	 * The failure mode an event-triggered build introduces: the dispatch stops firing and
	 * nothing notices, because a stale artifact serves exactly like a fresh one. The warning
	 * names the artifact, which is the whole reason `label` is a parameter.
	 */
	it('warns with the artifact label once a daily run has been missed', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const instance = createArtifactPointer({ pointerName: 'p.json', label: 'thumbnails' });

		const { stale } = await instance.getSignedArtifact(
			() => Date.parse(BUILT) + 40 * 60 * 60 * 1000,
			fakeSign,
			readerFor('aaaaaaaaaaaaaaaa', BUILT)
		);

		expect(stale).toBe(true);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('[thumbnails]'));
		warn.mockRestore();
	});
});
