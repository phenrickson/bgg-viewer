import { describe, it, expect, vi, beforeEach } from 'vitest';

// Record how the auth library is exercised, then mock it — no network / GCP.
const fetchIdToken = vi.fn(async (aud: string) => `token-for:${aud}`);
const getIdTokenClient = vi.fn(async () => ({ idTokenProvider: { fetchIdToken } }));

vi.mock('google-auth-library', () => ({
	GoogleAuth: class {
		getIdTokenClient = getIdTokenClient;
	}
}));

import { mintIdToken, _resetTokenCache } from './token';

beforeEach(() => {
	fetchIdToken.mockClear();
	getIdTokenClient.mockClear();
	_resetTokenCache();
});

describe('mintIdToken', () => {
	it('mints a token whose audience is the warehouse URL', async () => {
		const token = await mintIdToken('https://warehouse.example');

		expect(getIdTokenClient).toHaveBeenCalledWith('https://warehouse.example');
		expect(token).toBe('token-for:https://warehouse.example');
	});

	it('caches the IdTokenClient per audience (negotiates credentials once)', async () => {
		await mintIdToken('https://warehouse.example');
		await mintIdToken('https://warehouse.example');

		expect(getIdTokenClient).toHaveBeenCalledTimes(1);
		expect(fetchIdToken).toHaveBeenCalledTimes(2);
	});

	it('builds a distinct client for a different audience', async () => {
		await mintIdToken('https://a.example');
		await mintIdToken('https://b.example');

		expect(getIdTokenClient).toHaveBeenCalledTimes(2);
	});
});
