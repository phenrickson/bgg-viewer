/**
 * The two shapes are what let client and server deploy in either order, so both paths are
 * tested. The JSON shape is the one three call sites did NOT handle before this helper
 * existed — they would have parsed `{"url":…}` as Arrow and failed as a corrupt artifact.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchArtifactBytes } from './artifact-fetch';

const BYTES = new Uint8Array([65, 82, 82, 79, 87]);

const arrowResponse = () =>
	new Response(BYTES, {
		status: 200,
		headers: { 'content-type': 'application/vnd.apache.arrow.stream' }
	});

const jsonResponse = (url: string) =>
	new Response(JSON.stringify({ url, hash: 'abc', builtAt: '2026-09-22T06:00:00.000Z' }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});

afterEach(() => vi.unstubAllGlobals());

describe('fetchArtifactBytes', () => {
	it('returns the body directly when the endpoint serves the artifact itself', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => arrowResponse()));
		expect(await fetchArtifactBytes('/api/thumbnails')).toEqual(BYTES);
	});

	it('follows the signed URL when the endpoint answers with JSON', async () => {
		const fetchMock = vi.fn(async (input: string) =>
			input === '/api/thumbnails' ? jsonResponse('https://storage.googleapis.com/x') : arrowResponse()
		);
		vi.stubGlobal('fetch', fetchMock);

		expect(await fetchArtifactBytes('/api/thumbnails')).toEqual(BYTES);
		expect(fetchMock.mock.calls[1][0]).toBe('https://storage.googleapis.com/x');
	});

	it('does not send credentials to GCS', async () => {
		// The signature IS the authorisation. Cookies cross-origin would only invite a CORS
		// preflight failure, so the second fetch must carry no init object at all.
		const fetchMock = vi.fn(async (input: string, _init?: RequestInit) =>
			input === '/api/catalog' ? jsonResponse('https://storage.googleapis.com/y') : arrowResponse()
		);
		vi.stubGlobal('fetch', fetchMock);

		await fetchArtifactBytes('/api/catalog');
		expect(fetchMock.mock.calls[1][1]).toBeUndefined();
	});

	it('names the endpoint when it fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
		await expect(fetchArtifactBytes('/api/thumbnails')).rejects.toThrow(
			'/api/thumbnails fetch failed (401)'
		);
	});

	it('reports a failure fetching the signed object separately from the endpoint', async () => {
		const fetchMock = vi.fn(async (input: string) =>
			input === '/api/thumbnails'
				? jsonResponse('https://storage.googleapis.com/z')
				: new Response(null, { status: 403 })
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(fetchArtifactBytes('/api/thumbnails')).rejects.toThrow(
			'/api/thumbnails artifact fetch failed (403)'
		);
	});
});
