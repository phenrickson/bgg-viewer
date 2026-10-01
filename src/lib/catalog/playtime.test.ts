import { describe, it, expect } from 'vitest';
import {
	PLAYTIME_DOMAIN,
	PLAYTIME_TICKS,
	minutesAt,
	indexAt,
	formatMinutes,
	playtimeRangeLabel,
	boxPlaytimeLabel
} from './playtime';
import { toBounds } from './range';

describe('play-time scale', () => {
	it('maps index ↔ minutes on the ticks', () => {
		expect(minutesAt(4)).toBe(60);
		expect(indexAt(60)).toBe(4);
		expect(indexAt(null)).toBeNull();
	});

	it('parks an off-tick value on the nearest tick', () => {
		expect(PLAYTIME_TICKS[indexAt(50)!]).toBe(45);
		expect(PLAYTIME_TICKS[indexAt(1000)!]).toBe(240);
	});

	it('reads the edges as unbounded through toBounds', () => {
		expect(toBounds(0, PLAYTIME_DOMAIN.hi, PLAYTIME_DOMAIN, 1)).toEqual({ min: null, max: null });
		expect(toBounds(2, 4, PLAYTIME_DOMAIN, 1)).toEqual({ min: 2, max: 4 });
	});

	it('formats minutes for a reader', () => {
		expect(formatMinutes(45)).toBe('45 min');
		expect(formatMinutes(60)).toBe('1h');
		expect(formatMinutes(90)).toBe('1h 30');
		expect(formatMinutes(240, true)).toBe('4h+');
	});
});

describe('play-time labels', () => {
	it('reads the range back as a reader says it', () => {
		expect(playtimeRangeLabel(null, null)).toBe('any');
		expect(playtimeRangeLabel(null, 60)).toBe('up to 1h');
		expect(playtimeRangeLabel(120, null)).toBe('2h+');
		expect(playtimeRangeLabel(30, 120)).toBe('30 min – 2h');
	});
});

describe('boxPlaytimeLabel', () => {
	it('prints a range, a single time, or nothing', () => {
		expect(boxPlaytimeLabel(30, 120)).toBe('30–120 min');
		expect(boxPlaytimeLabel(45, 45)).toBe('45 min');
		expect(boxPlaytimeLabel(null, 60)).toBe('60 min');
		expect(boxPlaytimeLabel(0, 0)).toBeNull();
		expect(boxPlaytimeLabel(null, null)).toBeNull();
	});
});
