import { describe, it, expect } from 'vitest';
import { rankCatalog, rankShelf } from './rank';
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
		expect(rankCatalog(v, 999, none)).toEqual({ similar: [], recommender: [], sicko: [] });
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

describe('rankShelf', () => {
	// Owned: 2, 3, 4 (and the seed). geek_pct 0.1 / 0.9 / 0.5 → shelf_pct 0 / 1 / 0.5.
	const shelf = makeSet(
		[
			SEED,
			{ id: 2, sim: 0.9, pct: 0.1 },
			{ id: 3, sim: 0.8, pct: 0.9 },
			{ id: 4, sim: 0.7, pct: 0.5 },
			{ id: 5, sim: 0.99, pct: 0.99 } // not owned
		],
		[OPEN]
	);
	const owned = new Set([1, 2, 3, 4]);

	it('ranks only owned games, never the seed', () => {
		const out = rankShelf(shelf, 1, owned);
		for (const list of [out.similar, out.recommender, out.sicko]) {
			expect(ids(list).every((id) => [2, 3, 4].includes(id))).toBe(true);
		}
	});

	it('Most Similar is plain similarity, one per product line, top 10', () => {
		expect(ids(rankShelf(shelf, 1, owned).similar)).toEqual([2, 3, 4]);
		const many = makeSet(
			[SEED, ...Array.from({ length: 14 }, (_, i) => ({ id: 10 + i, sim: 0.9 - i * 0.01, line: i < 2 ? 7 : undefined }))],
			[OPEN]
		);
		const out = rankShelf(many, 1, new Set(many.ids)).similar;
		expect(out).toHaveLength(10);
		expect(ids(out).filter((id) => id === 10 || id === 11)).toEqual([10]);
	});

	it('Recommended blends 0.6·sim + 0.4·shelf_pct', () => {
		// 2: 0.54 + 0 = 0.54; 3: 0.48 + 0.4 = 0.88; 4: 0.42 + 0.2 = 0.62
		expect(ids(rankShelf(shelf, 1, owned).recommender)).toEqual([3, 4, 2]);
	});

	it('Dark Horses keeps only the lower half of the shelf by rating', () => {
		expect(ids(rankShelf(shelf, 1, owned).sicko)).toEqual([2]);
	});

	it('computes shelf_pct within the shelf, 0 for a one-game shelf', () => {
		const out = rankShelf(shelf, 1, new Set([2]));
		expect(ids(out.sicko)).toEqual([2]);
		for (const h of [...out.similar, ...out.recommender, ...out.sicko]) expect(Number.isNaN(h.similarity)).toBe(false);
	});

	it('returns empty lists for a seed with no vector', () => {
		expect(rankShelf(shelf, 999, owned)).toEqual({ similar: [], recommender: [], sicko: [] });
	});
});
