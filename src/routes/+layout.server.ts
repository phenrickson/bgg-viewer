import { isAdmin } from '$lib/server/auth/admin';
import type { LayoutServerLoad } from './$types';

// Expose the current user to every page (including /login) so the shell can
// render auth state, and whether to show admin-only nav. Pure read of locals.
export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.user,
	isAdmin: isAdmin(locals.user)
});
