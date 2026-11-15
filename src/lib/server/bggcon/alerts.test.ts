import { describe, it, expect } from 'vitest';
import { alertsName, getTopic, topicFor } from './alerts';
import type { JsonStore } from './store';
import type { SessionUser } from '../auth/session';

const seeded = () => 0.5;
const WORDS = /^bggcon-2026-[a-z]+-[a-z]+-[1-9][0-9]$/;
const VALID = /^[A-Za-z0-9_-]{1,64}$/;

/** An in-memory bucket. `raceWith` makes the next create lose to another tab's topic. */
function fakeStore(files: Record<string, unknown> = {}, raceWith?: string) {
	const writes: string[] = [];
	const store: JsonStore = {
		async read<T>(name: string) {
			return (files[name] as T) ?? null;
		},
		async write(name, value) {
			files[name] = value;
			writes.push(name);
		},
		async create(name, value) {
			if (raceWith) {
				files[name] = { topic: raceWith };
				raceWith = undefined;
				return false;
			}
			if (name in files) return false;
			files[name] = value;
			writes.push(name);
			return true;
		},
		async list(prefix) {
			return Object.keys(files).filter((k) => k.startsWith(prefix));
		}
	};
	return { store, files, writes };
}

function user(user_id: string, bgg_username: string | null): SessionUser {
	return { user_id, email: `${user_id}@example.com`, display_name: null, bgg_username };
}

describe('topicFor', () => {
	it('uses the BGG username when there is one', () => {
		expect(topicFor('phenrickson')).toBe('bggcon-2026-phenrickson');
	});

	it('lowercases a username and turns other characters into dashes', () => {
		expect(topicFor('Mr. Meeple')).toBe('bggcon-2026-mr--meeple');
	});

	it('cuts a long username so the topic is at most 64 characters', () => {
		expect(topicFor('x'.repeat(80)).length).toBe(64);
	});

	it('makes words and a number without a username, or when nothing usable is left', () => {
		for (const u of [null, '', '---', 'ÆØÅ']) expect(topicFor(u, seeded)).toMatch(WORDS);
	});

	it('only ever makes topics ntfy accepts', () => {
		for (const u of ['phenrickson', 'Mr. Meeple', 'a/b?c#d', 'x'.repeat(80), null]) {
			expect(topicFor(u, Math.random)).toMatch(VALID);
		}
	});
});

describe('alertsName', () => {
	it('is one file per user under bggcon/alerts/', () => {
		expect(alertsName('abc-123')).toBe('bggcon/alerts/abc-123.json');
	});

	it('refuses ids that could change the path', () => {
		expect(() => alertsName('../x')).toThrow();
	});
});

describe('getTopic', () => {
	it('makes the topic on first use and keeps it', async () => {
		const { store, files, writes } = fakeStore();
		const first = await getTopic(user('u1', 'phenrickson'), store);
		expect(first).toBe('bggcon-2026-phenrickson');
		expect(files['bggcon/alerts/u1.json']).toEqual({ topic: first });
		expect(await getTopic(user('u1', 'phenrickson'), store)).toBe(first);
		expect(writes).toEqual(['bggcon/alerts/u1.json']);
	});

	it('keeps a generated topic too, rather than making new words each visit', async () => {
		const { store } = fakeStore();
		const first = await getTopic(user('u1', null), store, Math.random);
		expect(await getTopic(user('u1', null), store, Math.random)).toBe(first);
	});

	it('shows the topic another tab saved first', async () => {
		const { store } = fakeStore({}, 'bggcon-2026-amber-otter-42');
		expect(await getTopic(user('u1', null), store, seeded)).toBe('bggcon-2026-amber-otter-42');
	});

	it('gives words to a second account with the same BGG username', async () => {
		const { store } = fakeStore({ 'bggcon/alerts/other.json': { topic: 'bggcon-2026-phenrickson' } });
		expect(await getTopic(user('u1', 'phenrickson'), store, seeded)).toMatch(WORDS);
	});
});
