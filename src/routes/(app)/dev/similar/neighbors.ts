/**
 * The ranking core for the tuning bench — pure, so it can be unit-tested (the page
 * component can't). Given the dataset arrays and a source row, return the ranked
 * neighbour list as `{ idx, sim }` (dataset indices, cosine similarity).
 *
 * Pipeline: hard filters → sim/rating blend → sort by score → selection. Selection is
 * plain score order unless `maxPerFamily` is set, in which case EVERY product line in the
 * list is held to N (keeping the most similar) — so Pandemic doesn't recommend eight
 * Pandemics, and a Pandemic-shaped game like Kings of Israel doesn't get ten either.
 * A game's line is its `Game:` family, else its smallest `Series:`, else none (never
 * capped). With `maxPerFamily = null` the output is the score-sorted top-K — the identity
 * the tests pin. Every knob here has to survive translation to the deployed SQL profile
 * (see bgg-data-warehouse `game_neighbors`), which is why there's no MMR/diversity term.
 */

/** Dataset slice the ranker needs. `Dataset` in `+page.svelte` is a structural superset. */
export interface RankData {
	n: number;
	dim: number;
	emb: Float32Array; // flat, L2-normalised — cosine = dot product
	cx: Float32Array;
	productLine: Int32Array; // the game's one product-line family id; 0 = none
	ids: Int32Array;
	users: Int32Array;
	geekPct: Float32Array; // percentile among rated games, 0..1; -1 = unrated
	nameTokens: Set<string>[];
}

export interface RankOpts {
	minUsers: number;
	band: number | null; // complexity band half-width; null = off
	excludeTitle: boolean;
	minRatingPct: number;
	minSim: number; // hard cosine floor, as a percent
	weight: number; // 1 = pure similarity; below 1 blends in (1-weight)·ratingPct
	topK: number;
	/** at most N neighbours from any one product line; null = no cap, 0 = drop every lined game */
	maxPerFamily: number | null;
}

type Scored = { idx: number; sim: number; score: number };

export function rankNeighbors(d: RankData, from: number, o: RankOpts): { idx: number; sim: number }[] {
	if (from < 0 || from >= d.n) return [];
	const { n, dim, emb, cx, productLine, geekPct, nameTokens } = d;

	const base = from * dim;
	const sCx = cx[from];
	const sTok = o.excludeTitle ? nameTokens[from] : null;

	const pool: Scored[] = [];
	for (let j = 0; j < n; j++) {
		if (j === from) continue;
		if (d.users[j] < o.minUsers) continue;
		if (o.band != null && Math.abs(cx[j] - sCx) > o.band) continue;
		if (sTok && sTok.size > 0) {
			let hit = false;
			for (const t of nameTokens[j]) if (sTok.has(t)) { hit = true; break; }
			if (hit) continue;
		}
		if (o.minRatingPct > 0) {
			const p = geekPct[j];
			if (p < 0 || p * 100 < o.minRatingPct) continue;
		}

		let sim = 0;
		const b = j * dim;
		for (let k = 0; k < dim; k++) sim += emb[base + k] * emb[b + k];
		if (o.minSim > 0 && sim * 100 < o.minSim) continue;

		const score =
			o.weight >= 1 ? sim : o.weight * sim + (1 - o.weight) * Math.max(0, geekPct[j]);
		pool.push({ idx: j, sim, score });
	}

	pool.sort((a, b) => b.score - a.score);

	// Fast path — nothing reorders the score sort.
	if (o.maxPerFamily == null) {
		return pool.slice(0, o.topK).map(({ idx, sim }) => ({ idx, sim }));
	}

	// Per-product-line cap: hold EVERY product line to N, walking in score order.
	// line 0 ("no product line") is never capped. The source is never its own candidate,
	// so this covers "don't recommend Pandemic a bunch of Pandemics" AND "don't hand a
	// Pandemic-shaped game ten Pandemics".
	const cap = o.maxPerFamily;
	const perLine = new Map<number, number>();
	const picked: { idx: number; sim: number }[] = [];
	for (let i = 0; i < pool.length && picked.length < o.topK; i++) {
		const line = productLine[pool[i].idx];
		if (line !== 0) {
			const c = perLine.get(line) ?? 0;
			if (c >= cap) continue;
			perLine.set(line, c + 1);
		}
		picked.push({ idx: pool[i].idx, sim: pool[i].sim });
	}
	return picked;
}
