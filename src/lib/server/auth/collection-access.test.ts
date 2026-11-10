import { describe, expect, it } from 'vitest';
import { canReadCollection } from './collection-access';
import { ADMIN_EMAIL } from './admin';
import type { SessionUser } from './session';

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
	user_id: '1',
	email: 'someone@example.com',
	display_name: null,
	bgg_username: 'alice',
	...over
});

describe('canReadCollection', () => {
	it('lets you read your own linked collection', () => {
		expect(canReadCollection(user(), 'alice')).toBe(true);
	});

	it("doesn't let you read someone else's", () => {
		expect(canReadCollection(user(), 'bob')).toBe(false);
	});

	it('lets the admin read any collection', () => {
		expect(canReadCollection(user({ email: ADMIN_EMAIL, bgg_username: null }), 'bob')).toBe(true);
	});

	it('refuses a signed-out request', () => {
		expect(canReadCollection(null, 'alice')).toBe(false);
	});

	it('refuses a user with no linked account', () => {
		expect(canReadCollection(user({ bgg_username: null }), 'alice')).toBe(false);
	});
});
