import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordLoad, estimateMs, humanise, DEFAULT_MS } from './estimate';

/** Minimal localStorage stand-in — the module reads the global directly. */
function fakeStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear()
	};
}

beforeEach(() => {
	vi.stubGlobal('localStorage', fakeStorage());
});

describe('estimateMs', () => {
	it('falls back to the default with no history', () => {
		expect(estimateMs()).toBe(DEFAULT_MS);
	});

	it('uses the median, so one pathological load cannot poison it', () => {
		[5000, 5200, 5100].forEach(recordLoad);
		expect(estimateMs()).toBe(5100);

		recordLoad(90_000); // a tab that went to sleep mid-load
		expect(estimateMs()).toBeLessThan(10_000);
	});

	it('keeps only the most recent samples, so it tracks a real change', () => {
		[20_000, 20_000, 20_000, 20_000, 20_000].forEach(recordLoad);
		expect(estimateMs()).toBe(20_000);
		// The catalog got faster; after enough new samples the old ones are gone.
		[2000, 2100, 2000, 2100, 2000].forEach(recordLoad);
		expect(estimateMs()).toBe(2000);
	});

	it('rejects implausible samples rather than storing them', () => {
		recordLoad(10); // sub-frame: not a real load
		recordLoad(10 * 60_000); // ten minutes: a backgrounded tab
		expect(estimateMs()).toBe(DEFAULT_MS);
	});

	it('survives storage being unavailable', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		});
		expect(() => recordLoad(5000)).not.toThrow();
		expect(estimateMs()).toBe(DEFAULT_MS);
	});
});

describe('humanise', () => {
	it('avoids false precision — an estimate is not a promise', () => {
		expect(humanise(19_400)).toBe('about 20 seconds');
		expect(humanise(22_330)).toBe('about 20 seconds');
		expect(humanise(23_000)).toBe('about 25 seconds');
	});

	it('does not say "0 seconds" for a fast load', () => {
		expect(humanise(300)).toBe('a moment');
		expect(humanise(4200)).toBe('about 4 seconds');
	});

	it('switches to minutes when seconds stop being useful', () => {
		expect(humanise(120_000)).toBe('about 2 minutes');
	});
});
