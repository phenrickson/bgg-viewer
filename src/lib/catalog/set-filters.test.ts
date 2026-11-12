import { describe, it, expect } from 'vitest';
import { withSetFilters, libraryValues, checkedOutValues, checkedOutSql, AVAILABLE_SQL } from './set-filters';

const off = { collection: false, library: false, availableOnly: false };

describe('withSetFilters', () => {
	it('leaves the where clause alone when no set filter is on', () => {
		expect(withSetFilters('year > 2000', off)).toBe('year > 2000');
	});

	// The existing collection filter must keep behaving exactly as it did.
	it('adds the owned collection, as appendCollectionFilter always has', () => {
		expect(withSetFilters('x', { ...off, collection: true })).toBe(
			'x AND game_id IN (SELECT game_id FROM owned_collection)'
		);
	});

	it('adds library membership', () => {
		expect(withSetFilters('x', { ...off, library: true })).toBe(
			'x AND game_id IN (SELECT game_id FROM con_library)'
		);
	});

	// "Available now" means a copy on the shelf, so it narrows to library games only.
	it('narrows to games with a copy on the shelf when available-only is on', () => {
		expect(withSetFilters('x', { ...off, library: true, availableOnly: true })).toBe(
			`x AND game_id IN (${AVAILABLE_SQL})`
		);
	});

	it('ignores available-only without the library (nothing to be available from)', () => {
		expect(withSetFilters('x', { ...off, availableOnly: true })).toBe('x');
	});

	// "Library games I own" is a real question at the con; the two compose with AND.
	it('combines the collection and the library', () => {
		expect(withSetFilters('x', { collection: true, library: true, availableOnly: false })).toBe(
			'x AND game_id IN (SELECT game_id FROM owned_collection) AND game_id IN (SELECT game_id FROM con_library)'
		);
	});
});

describe('AVAILABLE_SQL', () => {
	it('counts a game available when its copies outnumber those checked out', () => {
		expect(AVAILABLE_SQL).toContain('copies - COALESCE(o.n, 0) > 0');
	});
});

describe('libraryValues / checkedOutValues', () => {
	// These go straight into SQL, so every value must be coerced to an integer.
	it('renders library rows as tuples with the Tabletop.Events name', () => {
		expect(libraryValues([{ bgg_id: 13, name: 'Catan', copies: 2, play_to_win: true }])).toBe(
			"(13, 'Catan', 2, TRUE)"
		);
	});

	// Real names contain quotes ("So Wrong It's Right"); they must not break out of the string.
	it('escapes single quotes in names', () => {
		expect(libraryValues([{ bgg_id: 1, name: "It's '); DROP TABLE x; --", copies: 1, play_to_win: false }])).toBe(
			"(1, 'It''s ''); DROP TABLE x; --', 1, FALSE)"
		);
	});

	it('drops rows whose numbers are not usable', () => {
		const bad = [
			{ bgg_id: Number.NaN, name: 'x', copies: 1, play_to_win: false },
			{ bgg_id: 5, name: 'y', copies: 1, play_to_win: false }
		];
		expect(libraryValues(bad)).toBe("(5, 'y', 1, FALSE)");
	});

	it('renders checked-out counts as integer pairs', () => {
		expect(checkedOutValues({ 13: 2, 7865: 1 })).toBe('(13, 2), (7865, 1)');
	});

	it('is empty for nothing checked out', () => {
		expect(checkedOutValues({})).toBe('');
	});
});

describe('checkedOutSql', () => {
	// One statement, so two overlapping refreshes replace each other instead of both inserting
	// into the same table (which doubled every checked-out game).
	it('replaces the table in a single statement', () => {
		const sql = checkedOutSql({ 13: 2, 7865: 1 });
		expect(sql).toBe(
			'CREATE OR REPLACE TABLE con_checked_out AS SELECT * FROM (VALUES (13, 2), (7865, 1)) v(game_id, n)'
		);
		expect(sql).not.toContain(';');
	});

	it('creates it empty, with its types, when nothing is out', () => {
		expect(checkedOutSql({})).toBe('CREATE OR REPLACE TABLE con_checked_out (game_id INTEGER, n INTEGER)');
	});
});
