import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { loginSchema } from '$lib/schemas';
import { getUserByEmail, updateLastLogin } from '$lib/server/auth/users';
import { verifyPassword } from '$lib/server/auth/password';
import { signSession } from '$lib/server/auth/session';
import { SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth/cookie';
import { safeNext } from '$lib/server/auth/redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Already signed in → skip the form.
	if (locals.user) throw redirect(303, safeNext(url.searchParams.get('next')));
	return { form: await superValidate(zod(loginSchema)) };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await superValidate(request, zod(loginSchema));
		if (!form.valid) return fail(400, { form });

		const secret = env.SESSION_SECRET;
		if (!secret) return message(form, 'Server is misconfigured (no session secret).', { status: 500 });

		const user = await getUserByEmail(form.data.email);
		// One generic message for every failure — never reveal which accounts exist.
		if (!user || !user.is_active || !verifyPassword(form.data.password, user.password_hash)) {
			return message(form, 'Invalid email or password.', { status: 400 });
		}

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
		// Best-effort; a login shouldn't fail because the timestamp write did.
		try {
			await updateLastLogin(user.user_id);
		} catch {
			/* ignore */
		}

		throw redirect(303, safeNext(url.searchParams.get('next')));
	}
};
