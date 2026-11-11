/**
 * How a game looks in the genealogy / network tool, in either view. Shared, so the
 * Genealogy ⇄ Network flip changes only where games are and how they're linked, never what
 * they look like: the centre in the accent, every other game one colour, upcoming hollow,
 * size by ratings.
 */
import type { GameFacts } from './facts';

/** Colour buckets, indexing `lineagePalette`. */
export const LINKED = 0, CENTRE = 1, UPCOMING = 2;

export function lineagePalette(t: { chart: string[]; accent: string; background: string } | null | undefined): string[] {
	return t ? [t.chart[0], t.accent, t.background] : [];
}

export function bucketOf(facts: GameFacts, i: number, centre: number): number {
	return i === centre ? CENTRE : facts.upcoming[i] === 1 ? UPCOMING : LINKED;
}

/** Diameter from ratings on a log scale: 30 ratings → 5px, 100k → 18px. Upcoming: fixed (no ratings yet). */
const LOG_LO = Math.log10(30), LOG_HI = 5;
export const UPCOMING_DIAMETER = 10;
export function diameter(facts: GameFacts, i: number, centre: number): number {
	if (facts.upcoming[i] === 1 && i !== centre) return UPCOMING_DIAMETER;
	const t = (Math.log10(Math.max(1, facts.usersRated[i])) - LOG_LO) / (LOG_HI - LOG_LO);
	return Math.round(5 + Math.min(1, Math.max(0, t)) * 13);
}
