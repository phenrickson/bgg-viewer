import { describe, it, expect } from 'vitest';
import { signSession, readSession, DEFAULT_TTL_MS, type SessionUser } from './session';

const SECRET = 'test-secret-please-change';
const USER: SessionUser = { user_id: 'u-1', email: 'a@b.com', display_name: 'Ada' };

describe('session token', () => {
	it('round-trips a user', () => {
		const token = signSession(USER, SECRET);
		expect(readSession(token, SECRET)).toEqual(USER);
	});

	it('returns null for a missing token', () => {
		expect(readSession(undefined, SECRET)).toBeNull();
		expect(readSession('', SECRET)).toBeNull();
		expect(readSession('no-dot', SECRET)).toBeNull();
	});

	it('rejects a tampered payload', () => {
		const token = signSession(USER, SECRET);
		const forged = Buffer.from(JSON.stringify({ ...USER, email: 'evil@x.com', exp: Date.now() + 1e6 }))
			.toString('base64url');
		const tampered = `${forged}.${token.slice(token.indexOf('.') + 1)}`;
		expect(readSession(tampered, SECRET)).toBeNull();
	});

	it('rejects a tampered signature', () => {
		const token = signSession(USER, SECRET);
		expect(readSession(token.slice(0, -2) + 'xx', SECRET)).toBeNull();
	});

	it('rejects a different secret', () => {
		const token = signSession(USER, SECRET);
		expect(readSession(token, 'other-secret')).toBeNull();
	});

	it('rejects an expired token', () => {
		const past = Date.now() - DEFAULT_TTL_MS - 1000;
		const token = signSession(USER, SECRET, { now: past });
		expect(readSession(token, SECRET)).toBeNull();
	});

	it('honors a custom now for validity', () => {
		const now = 1_000_000_000_000;
		const token = signSession(USER, SECRET, { ttlMs: 1000, now });
		expect(readSession(token, SECRET, { now: now + 500 })).toEqual(USER);
		expect(readSession(token, SECRET, { now: now + 2000 })).toBeNull();
	});
});
