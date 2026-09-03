import { describe, it, expect } from 'vitest';
import { rankNeighbors, type RankData, type RankOpts } from './neighbors';

/** Build a RankData from a compact game spec. Embeddings are L2-normalised here. */
function makeData(
	games: {
		emb: number[];
		cx?: number;
		line?: number; // product-line family id; 0/undefined = none
		users?: number;
		geekPct?: number;
		tokens?: string[];
	}[]
): RankData {
	const dim = games[0].emb.length;
	const n = games.length;
	const emb = new Float32Array(n * dim);
	for (let i = 0; i < n; i++) {
		const v = games[i].emb;
		const norm = Math.hypot(...v) || 1;
		for (let k = 0; k < dim; k++) emb[i * dim + k] = v[k] / norm;
	}
	return {
		n,
		dim,
		emb,
		cx: Float32Array.from(games.map((g) => g.cx ?? 2)),
		productLine: Int32Array.from(games.map((g) => g.line ?? 0)),
		ids: Int32Array.from(games.map((_, i) => i + 100)),
		users: Int32Array.from(games.map((g) => g.users ?? 1000)),
		geekPct: Float32Array.from(games.map((g) => g.geekPct ?? 0.5)),
		nameTokens: games.map((g) => new Set(g.tokens ?? []))
	};
}

const opts = (over: Partial<RankOpts> = {}): RankOpts => ({
	minUsers: 0,
	band: null,
	excludeTitle: false,
	minRatingPct: 0,
	minSim: 0,
	weight: 1,
	topK: 10,
	maxPerFamily: null,
	...over
});

const idxs = (r: { idx: number }[]) => r.map((x) => x.idx);

describe('rankNeighbors', () => {
	it('with no cap, returns the score-sorted top-K (the identity case)', () => {
		const d = makeData([
			{ emb: [1, 0] }, // 0 = source
			{ emb: [0.9, 0.1] },
			{ emb: [0.5, 0.5] },
			{ emb: [0, 1] }
		]);
		expect(idxs(rankNeighbors(d, 0, opts()))).toEqual([1, 2, 3]);
		expect(idxs(rankNeighbors(d, 0, opts({ topK: 2 })))).toEqual([1, 2]);
	});

	it('caps a product line at N, keeping the most similar, then moves on', () => {
		const d = makeData([
			{ emb: [1, 0, 0], line: 7 }, // source (in line 7, but never its own candidate)
			{ emb: [0.99, 0.14, 0], line: 7 }, // line 7 — kept
			{ emb: [0.95, 0.31, 0], line: 7 }, // line 7 — kept
			{ emb: [0.9, 0.44, 0], line: 7 }, // line 7 — dropped by the cap
			{ emb: [0.6, 0, 0.8], line: 0 } // no line — untouched
		]);
		expect(idxs(rankNeighbors(d, 0, opts({ maxPerFamily: 2, topK: 3 })))).toEqual([1, 2, 4]);
	});

	it('caps EVERY line, not just the source line — a Pandemic-shaped source', () => {
		// source has no product line; the candidates are all one family (Game: Pandemic)
		const d = makeData([
			{ emb: [1, 0, 0], line: 0 }, // Kings of Israel — no line
			{ emb: [0.99, 0.10, 0], line: 42 }, // Pandemic
			{ emb: [0.98, 0.14, 0], line: 42 }, // Pandemic Legacy
			{ emb: [0.97, 0.17, 0], line: 42 }, // Pandemic Iberia
			{ emb: [0.6, 0, 0.8], line: 0 } // Forbidden Island — no line
		]);
		expect(idxs(rankNeighbors(d, 0, opts({ maxPerFamily: 1 })))).toEqual([1, 4]);
	});

	it('maxPerFamily 0 drops every game that has a product line', () => {
		const d = makeData([
			{ emb: [1, 0], line: 7 }, // source
			{ emb: [0.99, 0.01], line: 7 }, // has a line — dropped
			{ emb: [0.9, 0.1], line: 3 }, // different line — also dropped
			{ emb: [0.5, 0.5], line: 0 } // no line — kept
		]);
		expect(idxs(rankNeighbors(d, 0, opts({ maxPerFamily: 0 })))).toEqual([3]);
	});

	it('different lines each get their own budget', () => {
		// Irish Gauge (line 100). Iberian Gauge shares it; Ride the Rails is line 200.
		// cap 1: line 200 keeps Ride, line 100 keeps Iberian — both survive.
		const d = makeData([
			{ emb: [1, 0, 0], line: 100 }, // Irish Gauge
			{ emb: [0.9, 0.4, 0], line: 200 }, // Ride the Rails — different line
			{ emb: [0.85, 0.5, 0], line: 100 } // Iberian Gauge — Irish's line
		]);
		expect(idxs(rankNeighbors(d, 0, opts({ maxPerFamily: 1, topK: 3 })))).toEqual([1, 2]);
	});

	it('honours the hard filters before ranking', () => {
		const d = makeData([
			{ emb: [1, 0], cx: 2 }, // source
			{ emb: [0.99, 0.01], cx: 4, users: 5000 }, // out of band
			{ emb: [0.9, 0.1], cx: 2, users: 10 }, // below users floor
			{ emb: [0.5, 0.5], cx: 2, users: 5000 } // survives
		]);
		expect(idxs(rankNeighbors(d, 0, opts({ minUsers: 100, band: 0.75 })))).toEqual([3]);
	});
});
