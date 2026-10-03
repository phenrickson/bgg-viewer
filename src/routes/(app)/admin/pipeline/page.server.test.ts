import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above every other statement, so the mocks it closes over must be too.
const { getPipelineStatus, getCatalogPointer, warehouseClient } = vi.hoisted(() => {
	const getPipelineStatus = vi.fn();
	return {
		getPipelineStatus,
		getCatalogPointer: vi.fn(),
		warehouseClient: vi.fn(() => ({ getPipelineStatus }))
	};
});

vi.mock('$lib/server/warehouse', () => ({ warehouseClient }));
vi.mock('$lib/server/catalog/gcs', () => ({ getCatalogPointer }));

const { load } = await import('./+page.server');

const ADMIN = { email: 'phil.henrickson@gmail.com' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (user: unknown) => (load as any)({ locals: { user } });

describe('/admin/pipeline load', () => {
	beforeEach(() => {
		getPipelineStatus.mockReset().mockResolvedValue({ verdict: { status: 'ok' } });
		getCatalogPointer
			.mockReset()
			.mockResolvedValue({ name: 'c', hash: 'h', builtAt: '2026-10-02T07:31:00Z', rows: 39316, bytes: 1 });
	});

	it('404s for a non-admin', async () => {
		await expect(run({ email: 'someone@example.com' })).rejects.toMatchObject({ status: 404 });
		expect(getPipelineStatus).not.toHaveBeenCalled();
	});

	it('loads status and the catalog pointer for the admin', async () => {
		const data = await run(ADMIN);
		expect(getPipelineStatus).toHaveBeenCalledWith(14);
		expect(data).toEqual({
			status: { verdict: { status: 'ok' } },
			error: null,
			catalog: { builtAt: '2026-10-02T07:31:00Z', rows: 39316 }
		});
	});

	it('returns the error message when the warehouse call fails', async () => {
		getPipelineStatus.mockRejectedValue(new Error('warehouse GET /monitoring/pipeline failed (503): GH_TOKEN is not set'));
		const data = await run(ADMIN);
		expect(data.status).toBeNull();
		expect(data.error).toContain('GH_TOKEN is not set');
	});

	it('degrades to no catalog row when the pointer cannot be read', async () => {
		getCatalogPointer.mockRejectedValue(new Error('no bucket'));
		const data = await run(ADMIN);
		expect(data.catalog).toBeNull();
		expect(data.status).not.toBeNull();
	});

	it('returns the error message when the client cannot be built (no WAREHOUSE_API_URL)', async () => {
		warehouseClient.mockImplementationOnce(() => {
			throw new Error('WAREHOUSE_API_URL is not set — cannot reach the warehouse.');
		});
		const data = await run(ADMIN);
		expect(data.status).toBeNull();
		expect(data.error).toContain('WAREHOUSE_API_URL is not set');
	});
});
