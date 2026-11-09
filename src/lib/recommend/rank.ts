/**
 * Ranking in the browser, over the vectors artifact (`./vectors.ts`), for Recommend's pools that
 * the precomputed lists can't answer. Pure: a `VectorSet`, a seed and a pool in, lists out.
 * Spec: docs/superpowers/specs/2026-11-09-recommend-shelf-in-browser-design.md §2.
 *
 * `rankCatalog` is `analytics.game_neighbors` ported: the same rules, read from the profiles the
 * artifact ships, over the catalog minus a set of games (*games I don't own*). Checked against
 * the warehouse's own lists by `scripts/check-vectors-fidelity.ts`.
 */
import type { Hit, Lists } from './sources';
import { DIMS, type Profile, type VectorSet } from './vectors';

type StyleLists = Extract<Lists, { kind: 'styles' }>;
type Style = 'similar' | 'recommender' | 'sicko';
const STYLES: readonly Style[] = ['similar', 'recommender', 'sicko'];

const empty = (): StyleLists => ({ kind: 'styles', similar: [], recommender: [], sicko: [] });

/** Cosine similarity of two rows (unit vectors, so a dot product). */
function sim(v: VectorSet, a: number, b: number): number {
	let s = 0;
	const oa = a * DIMS;
	const ob = b * DIMS;
	for (let d = 0; d < DIMS; d++) s += v.vec[oa + d] * v.vec[ob + d];
	return s;
}

interface Scored {
	row: number;
	similarity: number;
	score: number;
}

/**
 * Best first by score; at most `cap` games per product line (null = no cap, 0 drops every game
 * in a line; a game in no line is never capped); stop at `topK`.
 */
function capAndTake(v: VectorSet, scored: Scored[], cap: number | null, topK: number): Hit[] {
	scored.sort((x, y) => y.score - x.score);
	const perLine = new Map<number, number>();
	const out: Hit[] = [];
	for (const s of scored) {
		const line = v.line[s.row];
		if (cap != null && line !== -1) {
			const k = (perLine.get(line) ?? 0) + 1;
			perLine.set(line, k);
			if (k > cap) continue;
		}
		out.push({ id: v.ids[s.row], similarity: s.similarity });
		if (out.length >= topK) break;
	}
	return out;
}

/** One catalog profile's list for the seed row, candidates minus `exclude`. */
function rankProfile(v: VectorSet, seed: number, p: Profile, exclude: ReadonlySet<number>): Hit[] {
	if (v.usersRated[seed] < p.source_min_users_rated || Number.isNaN(v.complexity[seed])) return [];
	const scored: Scored[] = [];
	for (let i = 0; i < v.ids.length; i++) {
		if (i === seed || exclude.has(v.ids[i])) continue;
		if (v.usersRated[i] < p.min_users_rated) continue;
		if (p.complexity_band != null && Math.abs(v.complexity[i] - v.complexity[seed]) > p.complexity_band) continue;
		const s = sim(v, seed, i);
		if (s < p.min_similarity) continue;
		const g = v.geekPct[i];
		if (p.min_rating_pct !== 0 && g < p.min_rating_pct) continue;
		if (p.max_rating_pct !== 1 && g >= p.max_rating_pct) continue;
		scored.push({ row: i, similarity: s, score: p.weight * s + (1 - p.weight) * g });
	}
	return capAndTake(v, scored, p.max_per_family, p.top_k);
}

/** *Games I don't own*: the three catalog styles for `seedId`, never returning `exclude`. */
export function rankCatalog(v: VectorSet, seedId: number, exclude: ReadonlySet<number>): StyleLists {
	const out = empty();
	const seed = v.index.get(seedId);
	if (seed == null) return out;
	for (const style of STYLES) {
		const p = v.profiles.find((x) => x.name === style);
		if (p) out[style] = rankProfile(v, seed, p, exclude);
	}
	return out;
}
