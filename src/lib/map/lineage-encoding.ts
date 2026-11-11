/**
 * How a game looks in the genealogy / network tool, in either view. Shared, so the
 * Genealogy ⇄ Network flip changes only where games are and how they're linked, never what
 * they look like: the centre in the accent, every other game one colour, upcoming hollow,
 * size by ratings.
 */
import type { GameFacts } from './facts';

/**
 * Room kept clear around the drawing, screen px: the HUD's chips and search across the top,
 * the key along the bottom, the year ticks down the left, and on the right the labels, which
 * run off to the right of their dots. Without it the tree's outermost games sat on the
 * canvas's very edge, under the HUD (Phil, 2026-11-11).
 */
export const FRAME_PAD = { top: 140, right: 170, bottom: 60, left: 60 } as const;

/**
 * Both layouts fit their games to [-0.9, 0.9] NDC on each axis. This maps that range into
 * the canvas minus `FRAME_PAD`, in NDC (y up). A canvas too small for the padding falls back
 * to the layouts' own fit.
 */
export function framer(width: number, height: number, pad: { top: number; right: number; bottom: number; left: number } = FRAME_PAD) {
	const x0 = -1 + (2 * pad.left) / width, x1 = 1 - (2 * pad.right) / width;
	const y0 = -1 + (2 * pad.bottom) / height, y1 = 1 - (2 * pad.top) / height;
	if (!(width > 0 && height > 0) || x1 - x0 < 0.4 || y1 - y0 < 0.4) return { x: (v: number) => v, y: (v: number) => v, w: width, h: height };
	const along = (v: number, lo: number, hi: number) => lo + ((v / 0.9 + 1) / 2) * (hi - lo);
	return {
		x: (v: number) => along(v, x0, x1),
		y: (v: number) => along(v, y0, y1),
		/** The framed box's size, screen px. */
		w: width - pad.left - pad.right,
		h: height - pad.top - pad.bottom
	};
}

/**
 * A link's strength on a fixed scale, the similarity floor → 1, so a given similarity looks
 * the same in any graph and either view. It used to be scaled to the links on screen, which
 * drew a 0.79 link (Nemesis — Mansions of Madness) as the thinnest whenever the rest ran
 * higher (Phil, 2026-11-11).
 */
export function linkStrength(sim: number, floor: number): number {
	return Math.min(1, Math.max(0, (sim - floor) / Math.max(1e-6, 1 - floor)));
}
/**
 * Stroke width and opacity for a link of strength `r` (`linkStrength`), drawn in the muted
 * ink in both views. Quiet on purpose: in the foreground ink at full strength the links
 * outshone the games (Phil, 2026-11-11). A link to the selected game is in the accent at
 * `litLinkWidth`.
 */
export const linkWidth = (r: number) => 0.8 + r * 1.6;
export const linkAlpha = (r: number) => 0.15 + 0.45 * r;
export const litLinkWidth = (r: number) => (1.2 + r * 2.4) * 1.1;

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
