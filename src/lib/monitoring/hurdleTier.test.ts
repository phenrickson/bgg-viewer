import { describe, it, expect } from 'vitest';
import { hurdleTier } from './hurdleTier';

describe('hurdleTier', () => {
	it('returns null for null (no prediction yet)', () => {
		expect(hurdleTier(null)).toBeNull();
	});

	it('returns null below 0.5', () => {
		expect(hurdleTier(0.49)).toBeNull();
		expect(hurdleTier(0)).toBeNull();
	});

	it('returns promising at exactly 0.5, up to but not including 0.7', () => {
		expect(hurdleTier(0.5)).toBe('promising');
		expect(hurdleTier(0.69)).toBe('promising');
	});

	it('returns standout at exactly 0.7 and above', () => {
		expect(hurdleTier(0.7)).toBe('standout');
		expect(hurdleTier(0.99)).toBe('standout');
	});
});
