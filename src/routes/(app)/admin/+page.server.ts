import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import type { PageServerLoad } from './$types';

// Pipeline is the panel's only section so far, so /admin opens straight onto it.
// Gate first, so a non-admin gets the same 404 as every other admin route.
export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(404, 'Not found');
	redirect(307, '/admin/pipeline');
};
