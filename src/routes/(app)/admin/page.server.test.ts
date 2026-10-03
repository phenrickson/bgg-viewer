import { describe, expect, it } from 'vitest';

const { load } = await import('./+page.server');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (user: unknown) => (load as any)({ locals: { user } });

describe('/admin load', () => {
	it('404s for a non-admin rather than revealing where the panel goes', async () => {
		await expect(run({ email: 'someone@example.com' })).rejects.toMatchObject({ status: 404 });
	});

	it('opens the admin straight onto Pipeline, its only section so far', async () => {
		await expect(run({ email: 'phil.henrickson@gmail.com' })).rejects.toMatchObject({
			status: 307,
			location: '/admin/pipeline'
		});
	});
});
