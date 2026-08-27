/**
 * Lets an already-registered account link (or change/clear) its BGG identity —
 * registration is the only other place this can be set, so this closes the gap for
 * everyone who signed up before it existed. See
 * docs/superpowers/plans/2026-08-27-collection-filter-phase2.md, Part F.
 */
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { settingsSchema } from '$lib/schemas';
import { updateBggUsername } from '$lib/server/auth/users';
import { triggerSync } from '$lib/server/collections/sync';
import { signSession } from '$lib/server/auth/session';
import { SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth/cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		form: await superValidate({ bgg_username: locals.user?.bgg_username ?? undefined }, zod(settingsSchema))
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		const form = await superValidate(request, zod(settingsSchema));
		if (!form.valid) return fail(400, { form });
		if (!locals.user) return fail(401, { form });

		const bggUsername = form.data.bgg_username?.trim() || null;
		const changed = bggUsername !== locals.user.bgg_username;

		await updateBggUsername(locals.user.user_id, bggUsername);

		const secret = env.SESSION_SECRET;
		if (secret) {
			cookies.set(
				SESSION_COOKIE,
				signSession({ ...locals.user, bgg_username: bggUsername }, secret),
				sessionCookieOptions(!dev)
			);
		}

		// Only sync on a real change to a non-null value — clearing needs no fetch, and
		// re-saving the same username needn't re-trigger one either.
		if (changed && bggUsername) void triggerSync(bggUsername);

		return message(form, bggUsername ? 'BGG account linked.' : 'BGG account unlinked.');
	}
};
