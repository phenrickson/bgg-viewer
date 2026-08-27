import { describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, isAdmin } from './admin';

describe('isAdmin', () => {
	it('matches the configured admin email', () => {
		expect(isAdmin({ user_id: '1', email: ADMIN_EMAIL, display_name: null, bgg_username: null })).toBe(true);
	});

	it('matches case-insensitively', () => {
		expect(isAdmin({ user_id: '1', email: ADMIN_EMAIL.toUpperCase(), display_name: null, bgg_username: null })).toBe(
			true
		);
	});

	it('rejects any other user', () => {
		expect(isAdmin({ user_id: '2', email: 'someone@example.com', display_name: null, bgg_username: null })).toBe(
			false
		);
	});

	it('rejects null/undefined', () => {
		expect(isAdmin(null)).toBe(false);
		expect(isAdmin(undefined)).toBe(false);
	});
});
