import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import type { LayoutServerLoad } from './$types';

// Everything under (app) requires a session. Unauthed → /login with a next param.
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
	return { user: locals.user, isAdmin: isAdmin(locals.user) };
};
