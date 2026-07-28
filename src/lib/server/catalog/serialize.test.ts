import { describe, it, expect } from 'vitest';
import { tableFromIPC } from 'apache-arrow';
import { rowsToArrowIPC } from './serialize';

const rows = [
	{
		game_id: 13,
		name: 'CATAN',
		year_published: 1995,
		geek_rating: 6.91,
		average_rating: 7.09,
		average_weight: 2.29,
		complexity: 2.29,
		users_rated: { value: '135151' }, // BigQuery INT64 wrapper
		min_players: 3,
		max_players: 4,
		categories: ['Economic', 'Negotiation'],
		mechanics: ['Trading', 'Dice Rolling'],
		families: []
	},
	{
		game_id: 822,
		name: 'Carcassonne',
		year_published: null, // nullable scalar
		geek_rating: 7.3,
		average_rating: 7.4,
		average_weight: 1.9,
		complexity: 1.9,
		users_rated: 120000,
		min_players: 2,
		max_players: 5,
		categories: ['City Building'],
		mechanics: [],
		families: ['Carcassonne']
	}
];

describe('rowsToArrowIPC', () => {
	it('round-trips scalars, nulls, and BigQuery INT64 wrappers', () => {
		const t = tableFromIPC(rowsToArrowIPC(rows));
		expect(t.numRows).toBe(2);
		const r0 = t.get(0)!.toJSON();
		expect(r0.game_id).toBe(13);
		expect(r0.name).toBe('CATAN');
		expect(r0.users_rated).toBe(135151); // wrapper coerced to number
		const r1 = t.get(1)!.toJSON();
		expect(r1.year_published).toBeNull(); // null preserved
	});

	it('preserves list facet columns as string arrays', () => {
		const t = tableFromIPC(rowsToArrowIPC(rows));
		const r0 = t.get(0)!.toJSON();
		expect([...r0.categories]).toEqual(['Economic', 'Negotiation']);
		expect([...r0.mechanics]).toEqual(['Trading', 'Dice Rolling']);
		expect([...r0.families]).toEqual([]);
		// list columns type as List<Utf8> so DuckDB can list_contains() them
		expect(t.schema.fields.find((f) => f.name === 'categories')!.type.toString()).toContain(
			'List'
		);
	});

	it('handles an empty result set', () => {
		const t = tableFromIPC(rowsToArrowIPC([]));
		expect(t.numRows).toBe(0);
	});
});
