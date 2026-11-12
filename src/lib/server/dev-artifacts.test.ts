import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { isArtifactObjectName, devArtifactUrl, serveDevArtifact } = await import('./dev-artifacts');

const NAME = 'catalog-a3f9c2b1d4e5f607.arrow.gz';
const user = { user_id: 'u', email: 'a@b.c', display_name: null, bgg_username: null };
const gz = new Uint8Array([0x1f, 0x8b, 1, 2, 3]);

describe('isArtifactObjectName', () => {
	it('accepts each of the four artifacts by their published name', () => {
		for (const prefix of ['catalog', 'thumbnails', 'vectors', 'coordinates']) {
			expect(isArtifactObjectName(`${prefix}-a3f9c2b1d4e5f607.arrow.gz`)).toBe(true);
		}
	});

	// The route must not become a way to read anything else in the bucket.
	it('refuses pointers, other prefixes and path tricks', () => {
		for (const name of [
			'catalog-current.json',
			'bggcon/library.json',
			'bggcon/stars/x.json',
			'../catalog-a3f9c2b1d4e5f607.arrow.gz',
			'other-a3f9c2b1d4e5f607.arrow.gz',
			'catalog-a3f9c2b1d4e5f607.arrow.gz/x',
			''
		]) {
			expect(isArtifactObjectName(name)).toBe(false);
		}
	});
});

describe('devArtifactUrl', () => {
	it('is a same-origin path naming the object', () => {
		expect(devArtifactUrl(NAME)).toBe(`/api/dev/artifact?name=${NAME}`);
	});
});

describe('serveDevArtifact', () => {
	const download = vi.fn(async () => gz);

	it('404s when the flag is off, so the route does not exist outside dev-lan', async () => {
		const res = await serveDevArtifact({ enabled: false, user, name: NAME, download });
		expect(res.status).toBe(404);
	});

	it('401s when signed out', async () => {
		const res = await serveDevArtifact({ enabled: true, user: null, name: NAME, download });
		expect(res.status).toBe(401);
	});

	it('400s on a name that is not an artifact, without touching the bucket', async () => {
		download.mockClear();
		const res = await serveDevArtifact({ enabled: true, user, name: 'bggcon/library.json', download });
		expect(res.status).toBe(400);
		expect(download).not.toHaveBeenCalled();
	});

	/**
	 * The objects are stored gzipped with content-encoding: gzip, and the browser fetching a
	 * signed URL gets them decompressed transparently. Serving the stored bytes with the same
	 * header gives the client exactly what GCS would have.
	 */
	it('serves the stored gzipped bytes as gzip-encoded Arrow', async () => {
		const res = await serveDevArtifact({ enabled: true, user, name: NAME, download });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/vnd.apache.arrow.stream');
		expect(res.headers.get('content-encoding')).toBe('gzip');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(gz);
		expect(download).toHaveBeenCalledWith(NAME);
	});
});
