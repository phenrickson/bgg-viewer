import { describe, it, expect, vi, beforeEach } from 'vitest';
import { devUser, forgetDevUser } from './dev-user';
import type { DbUser } from './users';

const PHIL: DbUser = {
	user_id: 'u-42',
	email: 'phil@example.com',
	password_hash: 'x',
	display_name: 'Phil',
	bgg_username: 'phil-bgg',
	is_active: true
};

beforeEach(() => forgetDevUser());

describe('devUser', () => {
	it('signs in as the real account for the email', async () => {
		const u = await devUser('phil@example.com', null, async () => PHIL);
		expect(u).toEqual({ user_id: 'u-42', email: 'phil@example.com', display_name: 'Phil', bgg_username: 'phil-bgg' });
	});
	it('looks the account up once, then remembers it', async () => {
		const lookup = vi.fn(async () => PHIL);
		await devUser('phil@example.com', null, lookup);
		await devUser('phil@example.com', null, lookup);
		expect(lookup).toHaveBeenCalledTimes(1);
	});
	it('fills in DEV_BGG_USERNAME when the account has no BGG username linked', async () => {
		const u = await devUser('phil@example.com', 'env-bgg', async () => ({ ...PHIL, bgg_username: null }));
		expect(u.bgg_username).toBe('env-bgg');
	});
	it('falls back to the made-up Dev User with no account, an inactive one, or a failed read', async () => {
		const madeUp = { user_id: 'dev-user', email: 'x@y.z', display_name: 'Dev User', bgg_username: 'b' };
		expect(await devUser('x@y.z', 'b', async () => null)).toEqual(madeUp);
		forgetDevUser();
		expect(await devUser('x@y.z', 'b', async () => ({ ...PHIL, email: 'x@y.z', is_active: false }))).toEqual(madeUp);
		forgetDevUser();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await devUser('x@y.z', 'b', async () => { throw new Error('no gcloud'); })).toEqual(madeUp);
		warn.mockRestore();
	});
});
