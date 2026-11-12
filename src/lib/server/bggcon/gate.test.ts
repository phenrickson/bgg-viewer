import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { requireAdmin, parseIds } from './gate';
import { ADMIN_EMAIL } from '../auth/admin';

const user = (email: string) => ({ user_id: 'u1', email, display_name: null, bgg_username: null });

function statusOf(fn: () => unknown): number | null {
	try {
		fn();
		return null;
	} catch (e) {
		return isHttpError(e) ? e.status : -1;
	}
}

describe('requireAdmin', () => {
	it('401s when signed out', () => {
		expect(statusOf(() => requireAdmin(null))).toBe(401);
	});

	// Phase 1: just Phil. Other accounts get 403, not the data.
	it('403s for a signed-in non-admin', () => {
		expect(statusOf(() => requireAdmin(user('someone@example.com')))).toBe(403);
	});

	it('returns the admin user', () => {
		expect(requireAdmin(user(ADMIN_EMAIL)).user_id).toBe('u1');
	});
});

describe('parseIds', () => {
	it('reads a comma-separated list of BGG ids', () => {
		expect(parseIds('13,7865')).toEqual([13, 7865]);
	});

	it('skips anything that is not a positive integer', () => {
		expect(parseIds('13,,x,-2,1.5,7865')).toEqual([13, 7865]);
	});

	it('is null when absent, meaning every game', () => {
		expect(parseIds(null)).toBeNull();
	});
});
