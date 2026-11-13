import { describe, it, expect, vi } from 'vitest';
import { createStars } from './stars.svelte';

/** A fake /api/bggcon/stars: GET returns `saved`; PUT stores the body, or fails when told to. */
function fakeApi(initial: number[] = []) {
	let saved = [...initial];
	let failNext = false;
	const puts: number[][] = [];
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	let hold = false;
	const f = vi.fn(async (_url: string, init?: RequestInit) => {
		if (init?.method === 'PUT') {
			if (hold) await gate;
			const body = JSON.parse(String(init.body)) as number[];
			puts.push(body);
			if (failNext) {
				failNext = false;
				return new Response('nope', { status: 500 });
			}
			saved = body;
			return Response.json(saved);
		}
		return Response.json(saved);
	});
	return {
		f,
		puts,
		get saved() {
			return saved;
		},
		failOnce: () => (failNext = true),
		holdPuts: () => (hold = true),
		releasePut: () => release()
	};
}

describe('stars', () => {
	it('loads the saved stars', async () => {
		const api = fakeApi([13, 7865]);
		const s = createStars(api.f);
		await s.load();
		expect(s.has(13)).toBe(true);
		expect(s.count).toBe(2);
	});

	// On the con floor a tap must feel instant: the star shows before the save finishes.
	it('shows a star immediately, before the save completes', async () => {
		const api = fakeApi();
		api.holdPuts();
		const s = createStars(api.f);
		await s.load();
		const saving = s.toggle(13);
		expect(s.has(13)).toBe(true);
		api.releasePut();
		await saving;
		expect(api.saved).toEqual([13]);
	});

	it('saves the whole list, and unstarring removes the id', async () => {
		const api = fakeApi([13]);
		const s = createStars(api.f);
		await s.load();
		await s.toggle(7865);
		await s.toggle(13);
		expect(api.puts).toEqual([[13, 7865], [7865]]);
		expect(s.has(13)).toBe(false);
	});

	it('puts the star back as it was, and says so, when the save fails', async () => {
		const api = fakeApi([13]);
		const s = createStars(api.f);
		await s.load();
		api.failOnce();
		await s.toggle(7865);
		expect(s.has(7865)).toBe(false);
		expect(s.error).toMatch(/couldn.t save/i);
	});

	it('clears the error after the next good save', async () => {
		const api = fakeApi();
		const s = createStars(api.f);
		await s.load();
		api.failOnce();
		await s.toggle(1);
		await s.toggle(2);
		expect(s.error).toBeNull();
	});

	// Two quick taps must not let an older save land after a newer one.
	it('saves one change at a time, in order', async () => {
		const api = fakeApi();
		const s = createStars(api.f);
		await s.load();
		await Promise.all([s.toggle(1), s.toggle(2)]);
		expect(api.puts).toEqual([[1], [1, 2]]);
		expect(api.saved).toEqual([1, 2]);
	});
});
