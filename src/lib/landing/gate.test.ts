import { describe, it, expect } from 'vitest';
import { gate } from './gate';

describe('gate', () => {
	it('sends a logged-out visitor through /login with the room as next', () => {
		expect(gate(false, '/games')).toBe('/login?next=%2Fgames');
	});

	it('preserves a scoped room url, query string and all, so login lands on the question clicked', () => {
		const url = '/discover?wmax=2&best=4';
		const out = gate(false, url);
		expect(out.startsWith('/login?next=')).toBe(true);
		expect(decodeURIComponent(out.slice('/login?next='.length))).toBe(url);
	});

	it('is a no-op for a logged-in user', () => {
		expect(gate(true, '/games')).toBe('/games');
		expect(gate(true, '/discover?wmax=2&best=4')).toBe('/discover?wmax=2&best=4');
	});
});
