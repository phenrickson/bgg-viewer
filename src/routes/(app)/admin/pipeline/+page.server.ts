import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { getCatalogPointer } from '$lib/server/catalog/gcs';
import { warehouseClient, type PipelineStatus } from '$lib/server/warehouse';
import type { PageServerLoad } from './$types';

/**
 * Admin-only pipeline monitor. A non-admin gets a 404, not a 403: the page doesn't
 * advertise that it exists. A warehouse failure renders as a message on the page
 * (missing GH_TOKEN, GitHub/BigQuery down), never as a partial status.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(404, 'Not found');

	const [result, catalog] = await Promise.all([
		warehouseClient()
			.getPipelineStatus(14)
			.then(
				(status: PipelineStatus) => ({ status, error: null }),
				(e: unknown) => ({ status: null, error: e instanceof Error ? e.message : String(e) })
			),
		getCatalogPointer().then(
			(p) => ({ builtAt: p.builtAt, rows: p.rows }),
			() => null
		)
	]);
	return { ...result, catalog };
};
