import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { readSession } from '$lib/server/auth/session';
import { SESSION_COOKIE } from '$lib/server/auth/cookie';

/**
 * Resolve the session cookie to `locals.user` on every request — pure crypto,
 * no database read. Route guards read `locals.user`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const secret = env.SESSION_SECRET;
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = secret ? readSession(token, secret) : null;
	return resolve(event);
};
