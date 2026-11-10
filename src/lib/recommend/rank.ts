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

type StyleLists = Lists;
type Style = 'similar' | 'recommender' | 'sicko';
const STYLES: readonly Style[] = ['similar', 'recommender', 'sicko'];

const empty = (): StyleLists => ({ similar: [], recommender: [], sicko: [] });

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
function rankProfile(v: VectorSet, seed: number, p: Profile, exclude: ReadonlySet<number>, topK: number): Hit[] {
	if (v.usersRated[seed] < p.source_min_users_rated || Number.isNaN(v.complexity[seed])) return [];
	const scored: Scored[] = [];
	for (let i = 0; i < v.ids.length; i++) {
		if (i === seed || exclude.has(v.ids[i])) continue;
		// game_neighbors only ranks candidates with a complexity, whatever the profile's band.
		if (Number.isNaN(v.complexity[i])) continue;
		if (v.usersRated[i] < p.min_users_rated) continue;
		if (p.complexity_band != null && Math.abs(v.complexity[i] - v.complexity[seed]) > p.complexity_band) continue;
		const s = sim(v, seed, i);
		if (s < p.min_similarity) continue;
		const g = v.geekPct[i];
		if (p.min_rating_pct !== 0 && g < p.min_rating_pct) continue;
		if (p.max_rating_pct !== 1 && g >= p.max_rating_pct) continue;
		scored.push({ row: i, similarity: s, score: p.weight * s + (1 - p.weight) * g });
	}
	return capAndTake(v, scored, p.max_per_family, topK);
}

/**
 * The three catalog styles for `seedId`, never returning `exclude` (*games I don't own*; an empty
 * set is *anywhere*). Up to `topK` per list; without it, each profile's own `top_k`.
 */
export function rankCatalog(
	v: VectorSet,
	seedId: number,
	exclude: ReadonlySet<number>,
	topK?: number
): StyleLists {
	const out = empty();
	const seed = v.index.get(seedId);
	if (seed == null) return out;
	for (const style of STYLES) {
		const p = v.profiles.find((x) => x.name === style);
		if (p) out[style] = rankProfile(v, seed, p, exclude, topK ?? p.top_k);
	}
	return out;
}

/**
 * *My shelf*'s three styles (Phil, 2026-11-09). The catalog profiles collapse on a ~160-game
 * shelf (Lesser Known empty, Recommended == Most Similar), so a shelf gets its own rules, a first
 * cut to tune against real collections: no floors and no band, so a small pool never empties;
 * `shelf_pct` is a game's rating percentile within the shelf, not the catalog.
 */
export const SHELF_STYLES: Record<Style, { weight: number; maxShelfPct: number | null }> = {
	similar: { weight: 1, maxShelfPct: null },
	recommender: { weight: 0.6, maxShelfPct: null },
	sicko: { weight: 1, maxShelfPct: 0.5 }
};
const SHELF_CAP = 1;
const SHELF_TOP_K = 10;

/** Each owned row's `PERCENT_RANK` of `geekPct` within the shelf: (rank − 1) / (n − 1), 0 when n = 1. */
function shelfPercentiles(v: VectorSet, rows: number[]): Map<number, number> {
	const pcts = rows.map((r) => v.geekPct[r]);
	const out = new Map<number, number>();
	for (const r of rows) {
		const below = pcts.filter((p) => p < v.geekPct[r]).length;
		out.set(r, rows.length > 1 ? below / (rows.length - 1) : 0);
	}
	return out;
}

/** *My shelf*: the three shelf styles for `seedId` among `owned` (the seed never included), up to `topK`. */
export function rankShelf(
	v: VectorSet,
	seedId: number,
	owned: ReadonlySet<number>,
	topK: number = SHELF_TOP_K
): StyleLists {
	const out = empty();
	const seed = v.index.get(seedId);
	if (seed == null) return out;
	const rows = [...owned].map((id) => v.index.get(id)).filter((r): r is number => r != null && r !== seed);
	const shelfPct = shelfPercentiles(v, rows);
	const sims = new Map(rows.map((r) => [r, sim(v, seed, r)]));
	for (const style of STYLES) {
		const { weight, maxShelfPct } = SHELF_STYLES[style];
		const scored: Scored[] = rows
			.filter((r) => maxShelfPct == null || shelfPct.get(r)! < maxShelfPct)
			.map((r) => ({ row: r, similarity: sims.get(r)!, score: weight * sims.get(r)! + (1 - weight) * shelfPct.get(r)! }));
		out[style] = capAndTake(v, scored, SHELF_CAP, topK);
	}
	return out;
}
