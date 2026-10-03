import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLineage, getPipelineStatus } = vi.hoisted(() => ({
	getLineage: vi.fn(),
	getPipelineStatus: vi.fn()
}));
vi.mock('$lib/server/warehouse', () => ({ warehouseClient: () => ({ getLineage, getPipelineStatus }) }));

const { load } = await import('./+page.server');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (user: unknown) => (load as any)({ locals: { user } });
const ADMIN = { email: 'phil.henrickson@gmail.com' };

describe('/admin/lineage load', () => {
	beforeEach(() => {
		getLineage.mockReset().mockResolvedValue({ nodes: [], edges: [] });
		getPipelineStatus.mockReset().mockResolvedValue({ today: { day: '2026-10-03', stages: [] } });
	});

	it('404s for a non-admin', async () => {
		await expect(run({ email: 'x@example.com' })).rejects.toMatchObject({ status: 404 });
		expect(getLineage).not.toHaveBeenCalled();
	});

	it('loads lineage and pipeline status for the admin', async () => {
		const data = await run(ADMIN);
		expect(data.lineage).toEqual({ nodes: [], edges: [] });
		expect(data.error).toBeNull();
		expect(data.pipeline.today.day).toBe('2026-10-03');
		// Same day count as the Pipeline page, so the API's cached report is reused.
		expect(getPipelineStatus).toHaveBeenCalledWith(14);
	});

	it('shows a lineage failure as a message', async () => {
		getLineage.mockRejectedValue(new Error('warehouse GET /monitoring/lineage failed (502)'));
		const data = await run(ADMIN);
		expect(data.lineage).toBeNull();
		expect(data.error).toContain('(502)');
	});

	it('still renders the graph when pipeline status fails', async () => {
		getPipelineStatus.mockRejectedValue(new Error('503'));
		const data = await run(ADMIN);
		expect(data.lineage).not.toBeNull();
		expect(data.pipeline).toBeNull();
	});
});
