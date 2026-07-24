/**
 * Stateless session token: `base64url(payload).base64url(HMAC-SHA256(payload))`.
 *
 * The token carries the user identity so verifying a request is pure crypto — no
 * per-request database read. Signed with a server secret; a modest TTL bounds how
 * long a compromised/stale token stays valid (we trade instant revocation for the
 * zero-cost verification the landing page wants).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionUser {
	user_id: string;
	email: string;
	display_name: string | null;
}

interface Payload extends SessionUser {
	exp: number;
}

export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hmac(data: string, secret: string): string {
	return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Sign a session token for `user`, valid for `ttlMs` from `now`. */
export function signSession(
	user: SessionUser,
	secret: string,
	opts: { ttlMs?: number; now?: number } = {}
): string {
	const now = opts.now ?? Date.now();
	const payload: Payload = {
		user_id: user.user_id,
		email: user.email,
		display_name: user.display_name,
		exp: now + (opts.ttlMs ?? DEFAULT_TTL_MS)
	};
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${body}.${hmac(body, secret)}`;
}

/** Verify + decode a token. Returns the user, or null if missing/tampered/expired. */
export function readSession(
	token: string | undefined | null,
	secret: string,
	opts: { now?: number } = {}
): SessionUser | null {
	if (!token) return null;
	const dot = token.indexOf('.');
	if (dot < 1) return null;

	const body = token.slice(0, dot);
	const sig = Buffer.from(token.slice(dot + 1));
	const expected = Buffer.from(hmac(body, secret));
	if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;

	let payload: Payload;
	try {
		payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (typeof payload.exp !== 'number' || payload.exp < (opts.now ?? Date.now())) return null;

	return { user_id: payload.user_id, email: payload.email, display_name: payload.display_name };
}
