import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { requireUser, parseIds } from './gate';

const user = (email: string) => ({ user_id: 'u1', email, display_name: null, bgg_username: null });

function statusOf(fn: () => unknown): number | null {
	try {
		fn();
		return null;
	} catch (e) {
		return isHttpError(e) ? e.status : -1;
	}
}

describe('requireUser', () => {
	it('401s when signed out', () => {
		expect(statusOf(() => requireUser(null))).toBe(401);
	});

	// Opened to every registered account (Phil, 2026-11-12), not just the admin.
	it('lets any signed-in user through', () => {
		expect(requireUser(user('someone@example.com')).user_id).toBe('u1');
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
