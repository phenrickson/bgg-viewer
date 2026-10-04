import { describe, expect, it } from 'vitest';

const { load } = await import('./+layout.server');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (user: unknown) => (load as any)({ locals: { user } });

describe('/admin layout load', () => {
	it('404s for a non-admin on every admin route', async () => {
		await expect(run({ email: 'someone@example.com' })).rejects.toMatchObject({ status: 404 });
		await expect(run(null)).rejects.toMatchObject({ status: 404 });
	});

	it('lists the admin sections for the sub-nav', async () => {
		const data = await run({ email: 'phil.henrickson@gmail.com' });
		expect(data.sections).toEqual([
			{ href: '/admin/pipeline', label: 'Pipeline' },
			{ href: '/admin/lineage', label: 'Lineage' }
		]);
	});
});
