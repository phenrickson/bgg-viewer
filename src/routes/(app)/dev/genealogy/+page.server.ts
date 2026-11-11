import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The tool's old address, where it ran as a dev prototype before it moved to `/lineage`
 * under Tools. Its state is all in the querystring, so the redirect keeps it.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(308, '/lineage' + url.search);
};
