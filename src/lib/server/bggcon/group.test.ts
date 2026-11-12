import { describe, it, expect } from 'vitest';
import { groupLibrary, availability, type TteRow } from './group';

let n = 0;
const row = (over: Partial<TteRow> = {}): TteRow => ({
	id: `copy-${++n}`,
	bgg_id: 7865,
	name: '10 Days in Africa',
	is_checked_out: 0,
	is_in_circulation: 1,
	is_play_to_win: 0,
	custom_fields: { ItemType: 'Standalone' },
	...over
});

describe('groupLibrary', () => {
	// The library lists physical copies; Explore and the page think in games.
	it('groups copies of one game under its bgg_id', () => {
		const a = row({ id: 'a' });
		const b = row({ id: 'b' });
		const { games } = groupLibrary([a, b, row({ id: 'c', bgg_id: 13, name: 'Catan' })]);
		expect(games).toHaveLength(2);
		expect(games.find((g) => g.bgg_id === 7865)).toEqual({
			bgg_id: 7865,
			name: '10 Days in Africa',
			copies: 2,
			play_to_win: false,
			copy_ids: ['a', 'b']
		});
	});

	// Real data has one 'standalone' alongside 6,767 'Standalone'.
	it('keeps standalone games whatever the case, and drops expansions and the rest', () => {
		const { games, dropped } = groupLibrary([
			row({ bgg_id: 1, custom_fields: { ItemType: 'standalone' } }),
			row({ bgg_id: 2, custom_fields: { ItemType: 'Expansion' } }),
			row({ bgg_id: 3, custom_fields: { ItemType: 'Playmat' } })
		]);
		expect(games.map((g) => g.bgg_id)).toEqual([1]);
		expect(dropped.notStandalone).toBe(2);
	});

	it('drops copies out of circulation', () => {
		const { games, dropped } = groupLibrary([row({ is_in_circulation: 0 })]);
		expect(games).toEqual([]);
		expect(dropped.outOfCirculation).toBe(1);
	});

	// 75 real copies have no bgg_id; they can't join the catalog, so count them, don't hide them.
	it('counts copies with no bgg_id rather than dropping them silently', () => {
		const { games, dropped } = groupLibrary([row({ bgg_id: null }), row({ bgg_id: 0 })]);
		expect(games).toEqual([]);
		expect(dropped.noBggId).toBe(2);
	});

	it('marks a game play-to-win when any copy is', () => {
		const { games } = groupLibrary([row(), row({ is_play_to_win: 1 })]);
		expect(games[0].play_to_win).toBe(true);
	});
});

describe('availability', () => {
	const { games } = groupLibrary([
		row({ id: 'x1', bgg_id: 1 }),
		row({ id: 'x2', bgg_id: 1 }),
		row({ id: 'y1', bgg_id: 2 })
	]);

	it('counts copies on the shelf per game', () => {
		expect(availability(games, new Set(['x1']))).toEqual({
			1: { available: 1, copies: 2 },
			2: { available: 1, copies: 1 }
		});
	});

	it('reports zero when every copy is checked out', () => {
		expect(availability(games, new Set(['y1']))[2]).toEqual({ available: 0, copies: 1 });
	});

	// A checked-out copy the snapshot doesn't know (added since) mustn't break or go negative.
	it('ignores checked-out ids it does not know', () => {
		expect(availability(games, new Set(['zzz']))[1]).toEqual({ available: 2, copies: 2 });
	});
});
