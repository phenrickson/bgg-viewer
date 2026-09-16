import { describe, it, expect } from 'vitest';
import { alignFacts, factsSql, CATEGORY_SLOTS } from './facts';
import type { CoordinateSet } from './coordinates';

function coords(ids: number[]): CoordinateSet {
	const arr = Int32Array.from(ids);
	return {
		ids: arr,
		pcs: [],
		umap: [new Float32Array(ids.length), new Float32Array(ids.length)],
		k: 0,
		model: 'm',
		version: 1,
		index: new Map(ids.map((id, i) => [id, i]))
	};
}

describe('alignFacts', () => {
	it('aligns catalog rows to artifact order, flags upcoming, and counts games the artifact lacks', () => {
		const set = coords([10, 20, 30]);
		const facts = alignFacts(
			set,
			{
				// catalog order differs from artifact order; 99 is not in the artifact
				game_id: [30, 99, 10],
				average_weight: [3.5, 1, 2.25],
				geek_rating: [6.1, 0, 7.9],
				average_rating: [7.2, 0, 8.4],
				year_published: [2027, 2000, 1995],
				users_rated: [40, 5, 12000],
				cat_code: [2, 1, 9]
			},
			['Other', 'Economic', 'Wargame'],
			2026,
			(id) => `game ${id}`
		);
		expect(Array.from(facts.weight)).toEqual([2.25, 0, 3.5]);
		expect(facts.geekRating[0]).toBeCloseTo(7.9);
		expect(facts.averageRating[2]).toBeCloseTo(7.2);
		expect(Array.from(facts.year)).toEqual([1995, 0, 2027]);
		expect(Array.from(facts.usersRated)).toEqual([12000, 0, 40]);
		expect(Array.from(facts.upcoming)).toEqual([0, 0, 1]);
		// code 9 is beyond the palette → other
		expect(Array.from(facts.category)).toEqual([0, 0, 2]);
		expect(facts.missing).toBe(1);
		expect(facts.name(20)).toBe('game 20');
	});
});

describe('factsSql', () => {
	it('encodes the curated categories as 1-based codes in priority order, escaping quotes', () => {
		const sql = factsSql(["Children's Game", 'Wargame']);
		expect(sql).toContain("WHEN list_contains(categories, 'Children''s Game') THEN 1");
		expect(sql).toContain("WHEN list_contains(categories, 'Wargame') THEN 2");
		// first listed wins: it is tested first
		expect(sql.indexOf("'Children''s Game'")).toBeLessThan(sql.indexOf("'Wargame'"));
		expect(sql).toContain('ELSE 0 END AS cat_code');
	});
	it('never encodes more than the palette can show', () => {
		const sql = factsSql(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
		expect(sql).toContain("'f') THEN 6");
		expect(sql).not.toContain("'g'");
	});
	it('degrades to a constant when there are no categories', () => {
		expect(factsSql([])).toContain('0 AS cat_code');
	});
	it('never asks for more slots than the palette has', () => {
		expect(CATEGORY_SLOTS).toBe(6);
	});
});
