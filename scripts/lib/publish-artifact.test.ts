/**
 * The publish ordering is the one genuinely dangerous property in the artifact rail — a
 * pointer naming an object that is not uploaded yet is an instant 404 for every reader at
 * once — and until this file it was guarded only by a comment and the care of whoever last
 * edited the script. These tests record the call order against a fake bucket.
 */
import { describe, it, expect, vi } from 'vitest';
import { publishArtifact, versionOf, type ArtifactBucket } from './publish-artifact';

const RAW = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

/** Records every operation in order, so ordering can be asserted rather than assumed. */
function fakeBucket(present = false) {
	const calls: string[] = [];
	const bucket: ArtifactBucket = {
		file: (name: string) => ({
			exists: async () => {
				calls.push(`exists:${name}`);
				return [present] as [boolean];
			},
			save: async () => {
				calls.push(`save:${name}`);
				return undefined;
			}
		})
	};
	return { bucket, calls };
}

const publish = (bucket: ArtifactBucket, extra: Record<string, unknown> = {}) =>
	publishArtifact({
		prefix: 'thumbnails',
		pointerName: 'thumbnails-current.json',
		raw: RAW,
		rows: 36_277,
		bucketName: 'test-bucket',
		bucket,
		log: () => {},
		...extra
	});

describe('ordering', () => {
	it('writes the pointer only after the artifact is saved', async () => {
		const { bucket, calls } = fakeBucket(false);
		const { hash } = await publish(bucket);

		expect(calls).toEqual([
			`exists:thumbnails-${hash}.arrow.gz`,
			`save:thumbnails-${hash}.arrow.gz`,
			'save:thumbnails-current.json'
		]);
	});

	it('still writes the pointer when the artifact was already present', async () => {
		// The pipeline runs daily whether or not the data changed; the pointer's builtAt is
		// what tells the staleness check the pipeline is alive, so it must be refreshed even
		// when nothing was uploaded.
		const { bucket, calls } = fakeBucket(true);
		const { uploaded, hash } = await publish(bucket);

		expect(uploaded).toBe(false);
		expect(calls).toEqual([
			`exists:thumbnails-${hash}.arrow.gz`,
			'save:thumbnails-current.json'
		]);
	});
});

describe('guards', () => {
	it('refuses to publish zero rows over a good artifact', async () => {
		const { bucket, calls } = fakeBucket(false);
		await expect(publish(bucket, { rows: 0 })).rejects.toThrow('zero rows');
		expect(calls).toEqual([]);
	});

	it('touches nothing on a dry run, but still reports the hash', async () => {
		const { bucket, calls } = fakeBucket(false);
		const { hash, uploaded } = await publish(bucket, { dryRun: true });

		expect(calls).toEqual([]);
		expect(uploaded).toBe(false);
		expect(hash).toBe(versionOf(RAW));
	});
});

describe('naming', () => {
	it('names the object by the hash of the UNCOMPRESSED bytes', async () => {
		const { bucket } = fakeBucket(false);
		const { hash, name } = await publish(bucket);

		expect(hash).toBe(versionOf(RAW));
		expect(name).toBe(`thumbnails-${hash}.arrow.gz`);
	});

	it('serves gzip with the encoding header that makes it readable', async () => {
		// Get `contentEncoding` wrong and the browser hands JavaScript gzip bytes that Arrow
		// cannot parse — a failure that looks like a corrupt artifact, not a metadata typo.
		const save = vi.fn(async () => undefined);
		const bucket: ArtifactBucket = {
			file: () => ({ exists: async () => [false] as [boolean], save })
		};

		await publish(bucket);

		expect(save.mock.calls[0][1]).toMatchObject({
			metadata: { contentEncoding: 'gzip', contentType: 'application/vnd.apache.arrow.stream' }
		});
		// The pointer must never be cached — it is what has to change the instant a new
		// artifact lands.
		expect(save.mock.calls[1][1]).toMatchObject({ metadata: { cacheControl: 'no-store' } });
	});
});
