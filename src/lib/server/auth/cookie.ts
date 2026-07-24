export const SESSION_COOKIE = 'session';

/** Cookie attributes for the session token. `secure` off in dev (plain http). */
export function sessionCookieOptions(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		maxAge: 60 * 60 * 24 * 7 // 7 days, matches the token TTL
	};
}
