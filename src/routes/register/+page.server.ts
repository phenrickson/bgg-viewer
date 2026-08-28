import { fail, redirect } from '@sveltejs/kit';
import { superValidate, setError } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { registerSchema } from '$lib/schemas';
import { getUserByEmail, createUser } from '$lib/server/auth/users';
import { triggerSync } from '$lib/server/collections/sync';
import { hashPassword } from '$lib/server/auth/password';
import { signSession } from '$lib/server/auth/session';
import { SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth/cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/');
	return { form: await superValidate(zod(registerSchema)) };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await superValidate(request, zod(registerSchema));
		if (!form.valid) return fail(400, { form });

		if (form.data.registration_code !== env.REGISTRATION_CODE) {
			return setError(form, 'registration_code', 'Invalid registration code.');
		}

		const existing = await getUserByEmail(form.data.email);
		if (existing) {
			return setError(form, 'email', 'An account with this email already exists.');
		}

		const secret = env.SESSION_SECRET;
		if (!secret) return setError(form, '', 'Server is misconfigured (no session secret).');

		const bggUsername = form.data.bgg_username?.trim() || null;

		const user = await createUser({
			email: form.data.email,
			passwordHash: hashPassword(form.data.password),
			displayName: form.data.display_name?.trim() || null,
			bggUsername
		});

		cookies.set(
			SESSION_COOKIE,
			signSession(
				{
					user_id: user.user_id,
					email: user.email,
					display_name: user.display_name,
					bgg_username: user.bgg_username
				},
				secret
			),
			sessionCookieOptions(!dev)
		);

		// Not awaited: a slow or failed BGG fetch must never hold up registration. Errors are
		// logged inside triggerSync, never thrown.
		if (bggUsername) void triggerSync(bggUsername);

		throw redirect(303, '/');
	}
};
