import { describe, expect, it } from 'vitest';
import { averageByHour, byDay, chicago, eachDay, isOpen, kpis } from './analytics';
import type { BggconActivity } from '$lib/server/warehouse/types';

// Wed 18 Nov, 9:00–10:30 Chicago (15:00Z–16:30Z); "now" is 10:20 AM Chicago.
const a: BggconActivity = {
	as_of: '2026-11-18T16:20:00+00:00',
	hours: [{ open: '2026-11-18T15:00:00+00:00', close: '2026-11-19T06:00:00+00:00' }],
	buckets: [
		{ start: '2026-11-18T15:00:00+00:00', checkouts: 2 },
		{ start: '2026-11-18T15:15:00+00:00', checkouts: 1 },
		{ start: '2026-11-18T15:30:00+00:00', checkouts: 0 },
		{ start: '2026-11-18T15:45:00+00:00', checkouts: 3 },
		{ start: '2026-11-18T16:00:00+00:00', checkouts: 1 },
		{ start: '2026-11-18T16:15:00+00:00', checkouts: 2 }
	]
};

describe('chicago', () => {
	it('gives the Chicago weekday, date, hour and minute', () => {
		expect(chicago('2026-11-18T15:00:00Z')).toEqual({ day: 'Wed', date: 18, hour: 9, minute: 0 });
		expect(chicago('2026-11-19T05:45:00Z')).toEqual({ day: 'Wed', date: 18, hour: 23, minute: 45 });
	});
});

describe('kpis', () => {
	it('totals, counts the last hour, and finds the busiest complete hour', () => {
		expect(kpis(a)).toEqual({ total: 9, lastHour: 6, busiest: { day: 'Wed', hour: 9, checkouts: 6 } });
	});

	it('is all zeros before any data', () => {
		expect(kpis({ as_of: null, hours: [], buckets: [] })).toEqual({ total: 0, lastHour: 0, busiest: null });
	});
});

describe('byDay', () => {
	it('sums each day, marks today partial and days to come null', () => {
		expect(byDay(a)).toEqual([
			{ day: 'Tue', checkouts: 0, partial: false },
			{ day: 'Wed', checkouts: 9, partial: true },
			{ day: 'Thu', checkouts: null, partial: false },
			{ day: 'Fri', checkouts: null, partial: false },
			{ day: 'Sat', checkouts: null, partial: false },
			{ day: 'Sun', checkouts: null, partial: false }
		]);
	});
});

describe('averageByHour and eachDay', () => {
	it('use complete, open hours only', () => {
		expect(averageByHour(a)).toEqual([{ hour: 9, average: 6 }]);
		const days = eachDay(a);
		expect(days.map((d) => d.day)).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
		expect(days[0].points).toEqual([{ hour: 9, checkouts: 6 }]);
		expect(days[1].points).toEqual([]);
	});
});

describe('isOpen', () => {
	it('is true inside the library hours only', () => {
		expect(isOpen(a, '2026-11-18T15:00:00Z')).toBe(true);
		expect(isOpen(a, '2026-11-18T14:45:00Z')).toBe(false);
		expect(isOpen(a, '2026-11-19T06:00:00Z')).toBe(false);
	});
});
