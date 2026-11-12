import { describe, it, expect } from 'vitest';
import { Table, vectorFromArray, tableToIPC, Int32, Float64, Utf8 } from 'apache-arrow';
import { readCatalog, checkVectors } from './catalog-basics';
import type { VectorSet } from '../vectors';

function catalogBytes(): Uint8Array {
	const table = new Table({
		game_id: vectorFromArray([13, 822], new Int32()),
		name: vectorFromArray(['Catan', 'Carcassonne'], new Utf8()),
		year_published: vectorFromArray([1995, null], new Int32()),
		users_rated: vectorFromArray([120000, 110000], new Int32()),
		min_players: vectorFromArray([3, 2], new Int32()),
		max_players: vectorFromArray([4, 5], new Int32()),
		min_playtime: vectorFromArray([60, null], new Int32()),
		max_playtime: vectorFromArray([120, 45], new Int32()),
		average_weight: vectorFromArray([2.3, 1.9], new Float64()),
		geek_rating: vectorFromArray([7.0, 7.3], new Float64()),
		average_rating: vectorFromArray([7.1, 7.4], new Float64())
	});
	return tableToIPC(table, 'stream');
}

function stubVectors(profiles: string[], rows = 2, dims = 64): VectorSet {
	return {
		ids: new Int32Array(rows),
		vec: new Float32Array(rows * dims),
		complexity: new Float32Array(rows),
		usersRated: new Int32Array(rows),
		geekPct: new Float32Array(rows),
		line: new Int32Array(rows),
		index: new Map(),
		profiles: profiles.map((name) => ({ name }) as VectorSet['profiles'][number]),
		version: 6,
		deployed: 6,
		rowVersion: null,
		model: 'embeddings-v2026'
	};
}

describe('readCatalog', () => {
	it('maps ids to rows', () => {
		const c = readCatalog(catalogBytes());
		expect(c.index.get(822)).toBe(1);
		expect(c.name[0]).toBe('Catan');
		expect(c.usersRated[1]).toBe(110000);
	});

	it('keeps nulls as null', () => {
		const c = readCatalog(catalogBytes());
		expect(c.year[1]).toBeNull();
		expect(c.minPlaytime[1]).toBeNull();
		expect(c.year[0]).toBe(1995);
	});
});

describe('checkVectors', () => {
	it('accepts 64-d vectors with all three profiles', () => {
		expect(() => checkVectors(stubVectors(['similar', 'recommender', 'sicko']))).not.toThrow();
	});

	it('rejects a missing profile', () => {
		expect(() => checkVectors(stubVectors(['similar', 'recommender']))).toThrow('unsupported vectors artifact');
	});

	it('rejects the wrong dimensionality', () => {
		expect(() => checkVectors(stubVectors(['similar', 'recommender', 'sicko'], 2, 32))).toThrow('unsupported vectors artifact');
	});
});
