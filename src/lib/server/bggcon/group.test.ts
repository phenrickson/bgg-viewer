import { describe, it, expect } from 'vitest';
import { groupLibrary, checkedOutByGame, type TteRow } from './group';

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
			play_to_win: false
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

describe('checkedOutByGame', () => {
	// Availability stands on its own: it needs only the checked-out rows, never the library.
	it('counts checked-out copies per BGG id', () => {
		expect(
			checkedOutByGame([row({ bgg_id: 1 }), row({ bgg_id: 1 }), row({ bgg_id: 2 })])
		).toEqual({ 1: 2, 2: 1 });
	});

	it('skips copies with no BGG id', () => {
		expect(checkedOutByGame([row({ bgg_id: null })])).toEqual({});
	});

	it('is empty when nothing is checked out', () => {
		expect(checkedOutByGame([])).toEqual({});
	});
});
