import type { LayoutServerLoad } from './$types';

// Expose the current user to every page (including /login) so the shell can
// render auth state. Pure read of locals — no database hit.
export const load: LayoutServerLoad = async ({ locals }) => ({ user: locals.user });
