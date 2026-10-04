import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarehouseError } from '$lib/server/warehouse/types';

const { getTableSchema } = vi.hoisted(() => ({ getTableSchema: vi.fn() }));
vi.mock('$lib/server/warehouse', async () => ({
	...(await vi.importActual<object>('$lib/server/warehouse/types')),
	warehouseClient: () => ({ getTableSchema })
}));

const { GET } = await import('./+server');
const ADMIN = { email: 'phil.henrickson@gmail.com' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (user: unknown, id: string | null) =>
	(GET as any)({ locals: { user }, url: new URL(`http://x/admin/lineage/schema${id ? `?id=${id}` : ''}`) });

describe('/admin/lineage/schema', () => {
	beforeEach(() => {
		// Braces matter: a function returned from beforeEach is run as its cleanup.
		getTableSchema.mockReset().mockResolvedValue({ id: 'p.d.t', schema: [] });
	});

	it('404s for a non-admin', async () => {
		await expect(call({ email: 'x@example.com' }, 'p.d.t')).rejects.toMatchObject({ status: 404 });
	});

	it('400s without an id', async () => {
		await expect(call(ADMIN, null)).rejects.toMatchObject({ status: 400 });
	});

	it('returns the schema', async () => {
		const res = await call(ADMIN, 'p.d.t');
		expect(await res.json()).toEqual({ id: 'p.d.t', schema: [] });
		expect(getTableSchema).toHaveBeenCalledWith('p.d.t');
	});

	it('passes a warehouse status through', async () => {
		getTableSchema.mockRejectedValue(new WarehouseError(403, 'no access'));
		await expect(call(ADMIN, 'p.d.t')).rejects.toMatchObject({ status: 403 });
	});
});
