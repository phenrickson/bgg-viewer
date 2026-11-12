/**
 * The con's own window: Wed 18 Nov 2026 9:00 AM to Sun 22 Nov 3:00 PM, America/Chicago (CST,
 * UTC−6). Drives the nav badge: "Soon" before, "Live" during, nothing after.
 */
export const CON_START = new Date('2026-11-18T15:00:00Z');
export const CON_END = new Date('2026-11-22T21:00:00Z');

export type ConPhase = 'soon' | 'live' | 'over';

export function conPhase(now: Date = new Date()): ConPhase {
	if (now < CON_START) return 'soon';
	if (now < CON_END) return 'live';
	return 'over';
}
