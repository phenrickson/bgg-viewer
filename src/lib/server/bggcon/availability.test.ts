import { describe, it, expect } from 'vitest';
import { chooseSource, parseSource, fromRecorder, fromLive, RECORDER_START, STALE_AFTER_MS } from './availability';

const T = new Date('2026-11-18T16:00:00Z');

describe('chooseSource', () => {
	// The recorder starts Tue 17 Nov 00:00 Chicago; until then the server asks Tabletop.Events.
	it('is live before the recorder starts and the recorder after', () => {
		expect(RECORDER_START.toISOString()).toBe('2026-11-17T06:00:00.000Z');
		expect(chooseSource(new Date(RECORDER_START.getTime() - 1))).toBe('live');
		expect(chooseSource(RECORDER_START)).toBe('recorder');
	});

	// BGGCON_AVAILABILITY: a fallback for the operator if the recorder breaks mid-con.
	it('follows the setting when there is one', () => {
		expect(chooseSource(T, 'live')).toBe('live');
		expect(chooseSource(new Date('2026-11-12T00:00:00Z'), 'recorder')).toBe('recorder');
		expect(chooseSource(T, 'nonsense')).toBe('recorder');
	});
});

describe('fromRecorder', () => {
	const file = {
		as_of: '2026-11-18T15:59:30+00:00',
		checked_out: { '13': 2, '822': 1 },
		checkouts: { '13': 9, '822': 4 }
	};

	it('reads the counts and the checkouts, keyed by BGG id', () => {
		expect(fromRecorder(file, T)).toEqual({
			as_of: '2026-11-18T15:59:30.000Z',
			stale: false,
			source: 'recorder',
			checked_out: { 13: 2, 822: 1 },
			checkouts: { 13: 9, 822: 4 }
		});
	});

	it('is stale once the recorder has not written for a few minutes', () => {
		const old = new Date(Date.parse(file.as_of) + STALE_AFTER_MS + 1);
		expect(fromRecorder(file, old).stale).toBe(true);
		expect(fromRecorder(file, new Date(Date.parse(file.as_of) + STALE_AFTER_MS)).stale).toBe(false);
	});

	it('is empty and stale when there is no file yet', () => {
		expect(fromRecorder(null, T)).toEqual({
			as_of: null,
			stale: true,
			source: 'recorder',
			checked_out: {},
			checkouts: {}
		});
	});

	it('copes with a file from before checkouts were counted', () => {
		expect(fromRecorder({ as_of: file.as_of, checked_out: {} }, T).checkouts).toEqual({});
	});
});

describe('fromLive', () => {
	// The live API has no "checkouts during the con"; the column shows nothing in this mode.
	it('passes the live counts through with no checkouts', () => {
		expect(fromLive({ value: { 13: 1 }, at: Date.parse('2026-11-18T15:59:00Z'), stale: false })).toEqual({
			as_of: '2026-11-18T15:59:00.000Z',
			stale: false,
			source: 'live',
			checked_out: { 13: 1 },
			checkouts: null
		});
	});
});

describe('parseSource', () => {
	// The page's Auto / Live / Recorder choice, as ?source= on the endpoint.
	it('reads live and recorder; anything else is auto (follow the date)', () => {
		expect(parseSource('live')).toBe('live');
		expect(parseSource('recorder')).toBe('recorder');
		expect(parseSource('auto')).toBeUndefined();
		expect(parseSource(null)).toBeUndefined();
		expect(parseSource('LIVE; drop')).toBeUndefined();
	});
});
