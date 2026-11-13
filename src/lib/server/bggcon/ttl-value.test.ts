import { describe, it, expect, vi } from 'vitest';
import { createTtlValue } from './ttl-value';

const TTL = 60_000;

describe('createTtlValue', () => {
	it('loads once and serves the same value within the TTL', async () => {
		const load = vi.fn(async () => 'a');
		let now = 0;
		const v = createTtlValue({ ttlMs: TTL, load, clock: () => now });
		expect((await v.get()).value).toBe('a');
		now = TTL - 1;
		expect((await v.get()).value).toBe('a');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('reloads once the TTL has passed', async () => {
		let n = 0;
		const load = vi.fn(async () => ++n);
		let now = 0;
		const v = createTtlValue({ ttlMs: TTL, load, clock: () => now });
		await v.get();
		now = TTL;
		expect((await v.get()).value).toBe(2);
	});

	// Every open tab polls; only one upstream request may be in flight at a time.
	it('shares one in-flight load between concurrent callers', async () => {
		let release!: (s: string) => void;
		const load = vi.fn(() => new Promise<string>((r) => (release = r)));
		const v = createTtlValue({ ttlMs: TTL, load, clock: () => 0 });
		const both = Promise.all([v.get(), v.get()]);
		release('x');
		expect((await both).map((r) => r.value)).toEqual(['x', 'x']);
		expect(load).toHaveBeenCalledTimes(1);
	});

	// The page must keep showing the last known state, marked with its age, if upstream is down.
	it('serves the last good value, with its original time, when a reload fails', async () => {
		let now = 1000;
		const load = vi.fn().mockResolvedValueOnce('good').mockRejectedValueOnce(new Error('down'));
		const v = createTtlValue({ ttlMs: TTL, load, clock: () => now });
		await v.get();
		now = 1000 + TTL;
		const r = await v.get();
		expect(r).toEqual({ value: 'good', at: 1000, stale: true });
	});

	it('throws when the first load fails, and retries on the next call', async () => {
		const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');
		const v = createTtlValue({ ttlMs: TTL, load, clock: () => 0 });
		await expect(v.get()).rejects.toThrow('down');
		expect((await v.get()).value).toBe('ok');
	});

	// After a failed reload, don't hammer upstream on every request: wait out a TTL again.
	it('does not retry a failed reload until another TTL has passed', async () => {
		let now = 0;
		const load = vi.fn().mockResolvedValueOnce('good').mockRejectedValue(new Error('down'));
		const v = createTtlValue({ ttlMs: TTL, load, clock: () => now });
		await v.get();
		now = TTL;
		await v.get();
		now = TTL + 1;
		await v.get();
		expect(load).toHaveBeenCalledTimes(2);
	});
});
