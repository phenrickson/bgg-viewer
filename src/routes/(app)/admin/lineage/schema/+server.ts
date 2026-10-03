import { error, json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/auth/admin';
import { warehouseClient, WarehouseError } from '$lib/server/warehouse';
import type { RequestHandler } from './$types';

/** One table's schema for the lineage detail panel, fetched when a node is clicked. Admin-only. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAdmin(locals.user)) error(404, 'Not found');
	const id = url.searchParams.get('id');
	if (!id) error(400, 'id is required');
	try {
		return json(await warehouseClient().getTableSchema(id));
	} catch (e) {
		const status = e instanceof WarehouseError && e.status >= 400 && e.status < 600 ? e.status : 502;
		error(status, e instanceof Error ? e.message : String(e));
	}
};
