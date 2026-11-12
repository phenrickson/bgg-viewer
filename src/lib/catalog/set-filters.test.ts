import { describe, it, expect } from 'vitest';
import { withSetFilters, libraryValues, checkedOutValues, AVAILABLE_SQL } from './set-filters';

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
	it('renders library rows as integer tuples', () => {
		expect(libraryValues([{ bgg_id: 13, copies: 2, play_to_win: true }])).toBe('(13, 2, TRUE)');
	});

	it('drops rows whose numbers are not usable', () => {
		const bad = [{ bgg_id: Number.NaN, copies: 1, play_to_win: false }, { bgg_id: 5, copies: 1, play_to_win: false }];
		expect(libraryValues(bad)).toBe('(5, 1, FALSE)');
	});

	it('renders checked-out counts as integer pairs', () => {
		expect(checkedOutValues({ 13: 2, 7865: 1 })).toBe('(13, 2), (7865, 1)');
	});

	it('is empty for nothing checked out', () => {
		expect(checkedOutValues({})).toBe('');
	});
});
