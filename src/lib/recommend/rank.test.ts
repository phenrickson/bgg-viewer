import { describe, it, expect } from 'vitest';
import { rankCatalog } from './rank';
import { DIMS, type Profile, type VectorSet } from './vectors';

/** A game for a fixture: `sim` is its cosine similarity to the seed (game 1, at angle 0). */
interface G {
	id: number;
	sim: number;
	cx?: number;
	ur?: number;
	pct?: number;
	line?: number;
}

function makeSet(games: G[], profiles: Profile[]): VectorSet {
	const n = games.length;
	const vec = new Float32Array(n * DIMS);
	games.forEach((g, i) => {
		const a = Math.acos(Math.max(-1, Math.min(1, g.sim)));
		vec[i * DIMS] = Math.cos(a);
		vec[i * DIMS + 1] = Math.sin(a);
	});
	return {
		ids: Int32Array.from(games.map((g) => g.id)),
		vec,
		complexity: Float32Array.from(games.map((g) => g.cx ?? 2.5)),
		usersRated: Int32Array.from(games.map((g) => g.ur ?? 1000)),
		geekPct: Float32Array.from(games.map((g) => g.pct ?? 0.5)),
		line: Int32Array.from(games.map((g) => g.line ?? -1)),
		index: new Map(games.map((g, i) => [g.id, i])),
		profiles,
		version: 6,
		model: 'm'
	};
}

const OPEN: Profile = {
	name: 'similar',
	weight: 1,
	complexity_band: null,
	max_per_family: null,
	min_similarity: 0,
	min_rating_pct: 0,
	max_rating_pct: 1,
	min_users_rated: 0,
	source_min_users_rated: 0,
	top_k: 10
};
const profile = (over: Partial<Profile>): Profile => ({ ...OPEN, ...over });
const ids = (hits: { id: number }[]) => hits.map((h) => h.id);
const SEED: G = { id: 1, sim: 1 };
const none = new Set<number>();

describe('rankCatalog', () => {
	it('ranks by weight·sim + (1−weight)·geek_pct', () => {
		const v = makeSet(
			[SEED, { id: 2, sim: 0.9, pct: 0.1 }, { id: 3, sim: 0.8, pct: 0.9 }],
			[profile({ name: 'recommender', weight: 0.6 })]
		);
		// 2: 0.54 + 0.04 = 0.58; 3: 0.48 + 0.36 = 0.84
		expect(ids(rankCatalog(v, 1, none).recommender)).toEqual([3, 2]);
	});

	it('applies the candidate floor, complexity band and similarity floor', () => {
		const v = makeSet(
			[
				{ ...SEED, cx: 2.5 },
				{ id: 2, sim: 0.9, ur: 50 }, // under min_users_rated
				{ id: 3, sim: 0.9, cx: 3.5 }, // outside the band
				{ id: 4, sim: 0.4 }, // under min_similarity
				{ id: 5, sim: 0.7, cx: 3.0 } // passes everything
			],
			[profile({ min_users_rated: 100, complexity_band: 0.75, min_similarity: 0.5 })]
		);
		expect(ids(rankCatalog(v, 1, none).similar)).toEqual([5]);
	});

	it('treats min_rating_pct 0 and max_rating_pct 1 as off', () => {
		const v = makeSet([SEED, { id: 2, sim: 0.9, pct: 0 }, { id: 3, sim: 0.8, pct: 1 }], [OPEN]);
		expect(ids(rankCatalog(v, 1, none).similar)).toEqual([2, 3]);
	});

	it('keeps only games below max_rating_pct, and at or above min_rating_pct', () => {
		const v = makeSet(
			[SEED, { id: 2, sim: 0.9, pct: 0.8 }, { id: 3, sim: 0.8, pct: 0.79 }, { id: 4, sim: 0.7, pct: 0.1 }],
			[profile({ name: 'sicko', max_rating_pct: 0.8, min_rating_pct: 0.5 })]
		);
		expect(ids(rankCatalog(v, 1, none).sicko)).toEqual([3]);
	});

	it('caps games per product line, and max_per_family 0 drops lined games', () => {
		const games = [SEED, { id: 2, sim: 0.9, line: 7 }, { id: 3, sim: 0.8, line: 7 }, { id: 4, sim: 0.7 }];
		expect(ids(rankCatalog(makeSet(games, [profile({ max_per_family: 1 })]), 1, none).similar)).toEqual([2, 4]);
		expect(ids(rankCatalog(makeSet(games, [profile({ max_per_family: 0 })]), 1, none).similar)).toEqual([4]);
	});

	it('returns nothing for a seed under source_min_users_rated', () => {
		const v = makeSet([{ ...SEED, ur: 10 }, { id: 2, sim: 0.9 }], [profile({ source_min_users_rated: 30 })]);
		expect(rankCatalog(v, 1, none).similar).toEqual([]);
	});

	it('returns empty lists for a seed with no vector', () => {
		const v = makeSet([SEED, { id: 2, sim: 0.9 }], [OPEN]);
		expect(rankCatalog(v, 999, none)).toEqual({ kind: 'styles', similar: [], recommender: [], sicko: [] });
	});

	it('removes excluded games before the cap and top_k, so lists still fill', () => {
		const v = makeSet(
			[SEED, { id: 2, sim: 0.95 }, { id: 3, sim: 0.9 }, { id: 4, sim: 0.85 }, { id: 5, sim: 0.8 }, { id: 6, sim: 0.75 }],
			[profile({ top_k: 3 })]
		);
		expect(ids(rankCatalog(v, 1, new Set([2, 3])).similar)).toEqual([4, 5, 6]);
	});

	it('reports similarity, not the blended score, and never returns the seed', () => {
		const v = makeSet([SEED, { id: 2, sim: 0.9, pct: 0 }], [profile({ weight: 0.5 })]);
		const [hit] = rankCatalog(v, 1, none).similar;
		expect(hit.id).toBe(2);
		expect(hit.similarity).toBeCloseTo(0.9, 5);
	});
});
