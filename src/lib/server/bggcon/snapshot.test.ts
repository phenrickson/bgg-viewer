import { describe, it, expect } from 'vitest';
import { assertUsable, type Snapshot } from './snapshot';

const snap = (games: number): Snapshot => ({
	builtAt: '2026-11-20T06:00:00.000Z',
	games: Array.from({ length: games }, (_, i) => ({ bgg_id: i + 1, name: `g${i}`, copies: 1, play_to_win: false })),
	dropped: { outOfCirculation: 0, notStandalone: 0, noBggId: 0 }
});

describe('assertUsable', () => {
	// An empty or broken pull must fail the job and leave yesterday's snapshot in place.
	it('refuses a snapshot with no games', () => {
		expect(() => assertUsable(snap(0))).toThrow(/no games/);
	});

	it('passes a snapshot with games', () => {
		expect(() => assertUsable(snap(3))).not.toThrow();
	});
});
