import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import type { LayoutServerLoad } from './$types';

/**
 * The admin panel. Every route under /admin is admin-only: a 404 (not a 403) so the
 * panel doesn't advertise that it exists. Pages still gate their own `load` too, since
 * SvelteKit runs page and layout loads in parallel.
 *
 * `sections` drives the panel's sub-nav; add a tool here when it gets a route.
 */
const SECTIONS = [
	{ href: '/admin/pipeline', label: 'Pipeline' },
	{ href: '/admin/lineage', label: 'Lineage' }
];

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(404, 'Not found');
	return { sections: SECTIONS };
};
