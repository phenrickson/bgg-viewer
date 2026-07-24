import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth/cookie';
import type { RequestHandler } from './$types';

// POST-only so a stray link/prefetch can't log anyone out (CSRF-safe via SvelteKit's
// same-origin form check). Delete the cookie with the same attributes it was set with.
export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, sessionCookieOptions(!dev));
	throw redirect(303, '/login');
};
