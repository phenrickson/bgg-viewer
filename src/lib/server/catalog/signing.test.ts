/**
 * Does the signer we depend on actually produce a stable URL?
 *
 * `gcs.test.ts` proves our *arithmetic* is stable, using a deterministic fake signer. That
 * would keep passing even if the real signer were nondeterministic — which is the case that
 * actually costs users 5.25 MB a visit. These tests exercise the real
 * `@google-cloud/storage` signing code path instead.
 *
 * No credentials and no network: v2/v4 signing is local crypto, so a throwaway keypair is
 * enough to observe the property. That is why this can live in the ordinary test suite.
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { Storage } from '@google-cloud/storage';

const { privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const file = (name = 'catalog-abc123.arrow.gz') =>
	new Storage({
		projectId: 'test-project',
		credentials: {
			client_email: 'test@test-project.iam.gserviceaccount.com',
			private_key: privateKey
		}
	})
		.bucket('test-bucket')
		.file(name);

/**
 * The real shape: anchored to a fixed 24h window, exactly as `gcs.ts` computes it. Captured
 * once at module load so every signature in a given test uses an identical value.
 *
 * Not an arbitrary far-future constant: v4 rejects anything more than seven days out, so a
 * distant fixed instant makes the v4 comparison below throw instead of measuring anything.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRES = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS + 48 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('v2 signing (what we rely on)', () => {
	it('produces an identical URL for the same object and expiry, signed at different times', async () => {
		const f = file();
		const [a] = await f.getSignedUrl({ version: 'v2', action: 'read', expires: EXPIRES });
		await sleep(1100); // across a second boundary — the granularity a timestamp would use
		const [b] = await f.getSignedUrl({ version: 'v2', action: 'read', expires: EXPIRES });
		expect(b).toBe(a);
	});

	it('changes when the artifact changes', async () => {
		const [a] = await file('catalog-aaa.arrow.gz').getSignedUrl({
			version: 'v2',
			action: 'read',
			expires: EXPIRES
		});
		const [b] = await file('catalog-bbb.arrow.gz').getSignedUrl({
			version: 'v2',
			action: 'read',
			expires: EXPIRES
		});
		expect(b).not.toBe(a);
	});

	it('changes when the window rolls over', async () => {
		const f = file();
		const [a] = await f.getSignedUrl({ version: 'v2', action: 'read', expires: EXPIRES });
		const [b] = await f.getSignedUrl({
			version: 'v2',
			action: 'read',
			expires: EXPIRES + 24 * 60 * 60 * 1000
		});
		expect(b).not.toBe(a);
	});
});

describe('v4 signing (why we do not use it)', () => {
	/**
	 * The reason `gcs.ts` pins version 'v2' — recorded as a test rather than a comment,
	 * because a future "modernise this to v4" would otherwise look like an obvious tidy-up
	 * and silently destroy browser caching while every existing test still passed.
	 *
	 * Note the expiry is held FIXED here, identical to the v2 case above. v4 is still
	 * unstable, because it embeds `X-Goog-Date` — the moment of signing — in the URL itself.
	 */
	it('is unstable even with an identical fixed expiry', async () => {
		const f = file();
		const [a] = await f.getSignedUrl({ version: 'v4', action: 'read', expires: EXPIRES });
		await sleep(1100);
		const [b] = await f.getSignedUrl({ version: 'v4', action: 'read', expires: EXPIRES });

		expect(b).not.toBe(a);

		// The mechanism, not just the symptom: the signing instant is IN the URL, so two
		// requests a second apart are two different URLs to any HTTP cache.
		const at = new URL(a).searchParams.get('X-Goog-Date');
		const bt = new URL(b).searchParams.get('X-Goog-Date');
		expect(at).toBeTruthy();
		expect(bt).not.toBe(at);
	});

	it('rejects an expiry beyond seven days, which v2 accepts', async () => {
		const f = file();
		await expect(
			f.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 8 * 24 * 60 * 60 * 1000 })
		).rejects.toThrow(/seven days/);
	});
});
