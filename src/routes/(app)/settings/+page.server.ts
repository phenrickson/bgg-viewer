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
import { fetchOwnedCollection } from '$lib/server/collections/read';
import { triggerSync } from '$lib/server/collections/sync';
import { signSession } from '$lib/server/auth/session';
import { SESSION_COOKIE, sessionCookieOptions } from '$lib/server/auth/cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const bggUsername = locals.user?.bgg_username ?? null;
	const collection = bggUsername ? await fetchOwnedCollection(bggUsername) : null;
	return {
		form: await superValidate({ bgg_username: bggUsername ?? undefined }, zod(settingsSchema)),
		email: locals.user?.email ?? null,
		bggUsername,
		collection: collection
			? { gameCount: collection.game_ids.length, updatedAt: collection.updated_at }
			: null
	};
};

export const actions: Actions = {
	save: async ({ request, cookies, locals }) => {
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
	},

	// A separate, non-superForm action: "Refresh now" isn't a field to validate, just a request
	// to re-fetch. Fire-and-forget like the trigger above, deliberately NOT awaited — the
	// downstream call can take up to a minute (BGG's export queues on its end), and there's no
	// reason to hold the HTTP request open for that. The client polls `/api/collection`
	// afterward to notice when it lands; a failure here surfaces as "still shows the old
	// timestamp" rather than an inline error, same tradeoff the passive triggers already make.
	refresh: async ({ locals }) => {
		if (!locals.user?.bgg_username) return fail(400, { message: 'No BGG account linked.' });
		void triggerSync(locals.user.bgg_username, { force: true });
		return { started: true };
	}
};
