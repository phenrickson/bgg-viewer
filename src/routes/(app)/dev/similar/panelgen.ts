/**
 * Panel generators — build the evaluation set from criteria instead of hand-picking.
 * All deterministic (games ordered by a hash of their id), so "regenerate" is stable.
 */
import { HARD_CASES } from './panel';

export interface GameStat {
	id: number;
	cx: number;
	geek: number; // 0 = unrated
	users: number;
	year: number;
}

/** xmur3 — a cheap deterministic hash so sampling is reproducible. */
function hash(n: number): number {
	let h = 2166136261 ^ n;
	h = Math.imul(h ^ (h >>> 16), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	return (h ^= h >>> 16) >>> 0;
}
const byHash = (a: GameStat, b: GameStat) => hash(a.id) - hash(b.id);

const cxBin = (c: number) => (c < 2 ? 'light' : c < 3 ? 'med' : 'heavy');
const gkBin = (g: number) => (g <= 0 ? 'unrated' : g < 6 ? 'low' : g < 7 ? 'mid' : 'high');
const popBin = (u: number) => (u < 500 ? 'niche' : u < 5000 ? 'mid' : 'popular');
const yrBin = (y: number) => (y < 2000 ? 'pre2000' : y < 2015 ? 'to2015' : 'recent');

export interface StratOpts {
	perCell: number;
	byComplexity: boolean;
	byRating: boolean;
	byPopularity: boolean;
	byYear: boolean;
	keepHardCases: boolean;
}

export function stratified(games: GameStat[], o: StratOpts): number[] {
	const cells = new Map<string, GameStat[]>();
	for (const g of games) {
		const key = [
			o.byComplexity ? cxBin(g.cx) : '',
			o.byRating ? gkBin(g.geek) : '',
			o.byPopularity ? popBin(g.users) : '',
			o.byYear ? yrBin(g.year) : ''
		].join('|');
		const bucket = cells.get(key);
		if (bucket) bucket.push(g);
		else cells.set(key, [g]);
	}
	const out = new Set<number>(o.keepHardCases ? HARD_CASES : []);
	for (const bucket of cells.values()) {
		bucket.sort(byHash);
		for (const g of bucket.slice(0, o.perCell)) out.add(g.id);
	}
	// id-hash order so the panel isn't hard-cases-then-buckets front-loaded.
	return [...out].sort((a, b) => hash(a) - hash(b));
}

function withHardCases(ids: number[]): number[] {
	return [...new Set([...HARD_CASES, ...ids])].sort((a, b) => hash(a) - hash(b));
}

/** Presets. */
export const presets = {
	blockbusters: (games: GameStat[], n = 60) =>
		withHardCases(
			[...games].sort((a, b) => b.users - a.users).slice(0, n).map((g) => g.id)
		),
	wellRatedObscure: (games: GameStat[], n = 60) =>
		withHardCases(
			games
				.filter((g) => g.geek >= 7 && g.users >= 100 && g.users <= 1500)
				.sort(byHash)
				.slice(0, n)
				.map((g) => g.id)
		),
	recent: (games: GameStat[], n = 60) =>
		withHardCases(
			games
				.filter((g) => g.year >= 2020 && g.users >= 100)
				.sort(byHash)
				.slice(0, n)
				.map((g) => g.id)
		)
};
