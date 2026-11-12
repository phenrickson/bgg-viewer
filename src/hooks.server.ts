import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { readSession } from '$lib/server/auth/session';
import { SESSION_COOKIE } from '$lib/server/auth/cookie';
import { devUser } from '$lib/server/auth/dev-user';
import { getUserByEmail } from '$lib/server/auth/users';

/**
 * Resolve the session cookie to `locals.user` on every request — pure crypto,
 * no database read. Route guards read `locals.user`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const secret = env.SESSION_SECRET;
	const token = event.cookies.get(SESSION_COOKIE);
	let user = secret ? readSession(token, secret) : null;

	// Dev-only convenience: skip the login flow while iterating locally. Guarded by
	// `dev` so it can never reach production, and opt-in via DEV_AUTH_EMAIL so the
	// real login/register flow stays testable (just unset the var). Signs in as the
	// account with that email when there is one (one lookup per server; see dev-user.ts).
	if (!user && dev && env.DEV_AUTH_EMAIL) {
		user = await devUser(env.DEV_AUTH_EMAIL, env.DEV_BGG_USERNAME || null, getUserByEmail);
	}

	event.locals.user = user;
	return resolve(event);
};
