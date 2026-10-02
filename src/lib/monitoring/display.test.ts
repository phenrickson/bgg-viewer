import { describe, expect, it } from 'vitest';
import {
	clock,
	coverage,
	duration,
	elapsed,
	freshness,
	freshnessReference,
	STATUS_GLYPH,
	STATUS_TONE,
	STATUS_WORD
} from './display';

describe('status vocabulary', () => {
	it('gives every status a word, and a tone that is never green/red by name', () => {
		for (const s of ['ok', 'warn', 'fail', 'running', 'pending', 'not_reached'] as const) {
			expect(STATUS_WORD[s]).toBeTruthy();
			expect(['ok', 'warn', 'fail', 'idle']).toContain(STATUS_TONE[s]);
			expect(STATUS_GLYPH[s]).toBeTypeOf('string');
		}
	});
});

describe('duration / clock / elapsed', () => {
	it('formats minutes and hours', () => {
		expect(duration('2026-10-02T06:26:05Z', '2026-10-02T06:30:10Z')).toBe('4m');
		expect(duration('2026-10-02T06:26:00Z', '2026-10-02T07:31:00Z')).toBe('1h 05m');
		expect(duration(null, '2026-10-02T07:31:00Z')).toBe('');
	});
	it('shows UTC wall time', () => {
		expect(clock('2026-10-02T07:18:57Z')).toBe('07:18');
		expect(clock(null)).toBe('—');
	});
	it('says how long ago', () => {
		const now = new Date('2026-10-02T12:16:00Z');
		expect(elapsed('2026-10-02T07:24:00Z', now)).toBe('4h 52m');
		expect(elapsed(null, now)).toBe('');
	});
});

describe('freshness', () => {
	const ref = '2026-10-02T06:26:05Z';
	it('is fresh when updated after the chain started', () => {
		expect(freshness('2026-10-02T07:29:00Z', ref)).toEqual({ tone: 'ok', label: 'Fresh' });
	});
	it('counts days behind', () => {
		expect(freshness('2026-10-01T07:29:00Z', ref)).toEqual({ tone: 'warn', label: 'A day old' });
		expect(freshness('2026-09-29T07:29:00Z', ref)).toEqual({ tone: 'warn', label: '3 days old' });
	});
	it('handles never', () => {
		expect(freshness(null, ref)).toEqual({ tone: 'warn', label: 'Never updated' });
	});
	it('uses stage 1 start, else 05:00 UTC on the chain day', () => {
		expect(freshnessReference({ day: '2026-10-02', stages: [{ started: ref }] })).toBe(ref);
		expect(freshnessReference({ day: '2026-10-02', stages: [{ started: null }] })).toBe(
			'2026-10-02T05:00:00Z'
		);
	});
});

describe('coverage', () => {
	it('computes a share and flags below 99.5%', () => {
		expect(coverage(39316, 39316)).toEqual({ pct: 1, low: false });
		expect(coverage(994, 1000)).toEqual({ pct: 0.994, low: true });
	});
	it('is null without a universe', () => {
		expect(coverage(null, null)).toBeNull();
		expect(coverage(5, 0)).toBeNull();
	});
});
