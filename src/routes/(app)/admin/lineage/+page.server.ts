import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { warehouseClient, type Lineage, type PipelineStatus } from '$lib/server/warehouse';
import type { PageServerLoad } from './$types';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Admin-only lineage graph. Pipeline status is loaded alongside for the freshness
 * reference and coverage; if it fails the graph still renders (with a fallback
 * reference). A lineage failure renders as a message, never a 500.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(404, 'Not found');
	const [lineage, pipeline] = await Promise.all([
		Promise.resolve()
			.then(() => warehouseClient().getLineage())
			.then(
				(l: Lineage) => ({ lineage: l, error: null }),
				(e: unknown) => ({ lineage: null, error: message(e) })
			),
		Promise.resolve()
			// 14 days, like the Pipeline page: the API caches per day count, so this reuses
			// that report instead of starting its own GitHub fan-out and freshness query.
			.then(() => warehouseClient().getPipelineStatus(14))
			.then(
				(p: PipelineStatus) => p,
				() => null
			)
	]);
	return { ...lineage, pipeline };
};
