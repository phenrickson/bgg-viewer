import { describe, it, expect } from 'vitest';
import { conPhase, CON_START, CON_END } from './window';

describe('conPhase', () => {
	// Wed 18 Nov 2026 9:00 AM to Sun 22 Nov 3:00 PM, America/Chicago (CST, UTC−6).
	it('knows the con window in UTC', () => {
		expect(CON_START.toISOString()).toBe('2026-11-18T15:00:00.000Z');
		expect(CON_END.toISOString()).toBe('2026-11-22T21:00:00.000Z');
	});

	it('is soon before it opens, live while it runs, over after', () => {
		expect(conPhase(new Date('2026-11-12T12:00:00Z'))).toBe('soon');
		expect(conPhase(new Date('2026-11-18T14:59:59Z'))).toBe('soon');
		expect(conPhase(new Date('2026-11-18T15:00:00Z'))).toBe('live');
		expect(conPhase(new Date('2026-11-22T20:59:59Z'))).toBe('live');
		expect(conPhase(new Date('2026-11-22T21:00:00Z'))).toBe('over');
	});
});
