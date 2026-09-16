/**
 * Size and colour encodings for the map, as pure functions over the aligned facts.
 *
 * Colour is bucketed rather than computed per point: canvas `fillStyle` changes are the
 * expensive part of drawing 36k dots, so each point gets a small bucket index once per
 * colour change and the renderer draws bucket by bucket. Continuous ramps quantise to
 * `RAMP_STEPS` shades — invisible at dot size, and it makes the legend a plain list.
 *
 * Colours are token *values* resolved by the caller from `app.css` (see `readPalette` in
 * the component) so this module never sees a hex and dark mode just works.
 */
import type { GameFacts } from './facts';
import type { ColourBy } from './view';

export interface Palette {
	/** `--chart-1..6` */
	chart: string[];
	/** `--map-ramp-lo` / `--map-ramp-hi` — light→dark shades of one hue. */
	ramp: [string, string];
	/** `--muted-foreground` — established / other. */
	muted: string;
	/** `--primary` — upcoming, selected. */
	accent: string;
}

export const RAMP_STEPS = 12;
export const RADIUS_MIN = 1.2;
export const RADIUS_MAX = 9;
export const RADIUS_UPCOMING = 2.2;

/** log-popularity → px. Anchors: 30 ratings ≈ min, 100k ratings ≈ max. */
export function radiusFor(usersRated: number, upcoming: boolean): number {
	if (upcoming) return RADIUS_UPCOMING;
	const t = (Math.log1p(Math.max(usersRated, 0)) - Math.log1p(30)) / (Math.log1p(100_000) - Math.log1p(30));
	return RADIUS_MIN + Math.min(Math.max(t, 0), 1) * (RADIUS_MAX - RADIUS_MIN);
}

/** Parse `oklch(L C H)` (optionally `/ alpha`) into its three channels. */
export function parseOklch(s: string): [number, number, number] | null {
	const m = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/i.exec(s);
	if (!m) return null;
	let l = Number(m[1]);
	if (s.includes('%')) l /= 100;
	return [l, Number(m[2]), Number(m[3])];
}

/** Interpolate two oklch strings in oklch space, shortest hue path. */
export function oklchMix(lo: string, hi: string, t: number): string {
	const a = parseOklch(lo);
	const b = parseOklch(hi);
	if (!a || !b) return t < 0.5 ? lo : hi;
	let dh = b[2] - a[2];
	if (dh > 180) dh -= 360;
	if (dh < -180) dh += 360;
	const l = a[0] + (b[0] - a[0]) * t;
	const c = a[1] + (b[1] - a[1]) * t;
	const h = (a[2] + dh * t + 360) % 360;
	return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

export interface Colouring {
	/** Bucket per point, aligned to the facts. */
	bucketOf: Uint8Array;
	/** Colour per bucket. */
	colours: string[];
	/** Legend entries in display order; `bucket` indexes `colours`. */
	legend: { label: string; bucket: number }[];
	/** Continuous encodings expose their domain for the legend's end labels. */
	domain?: [number, number];
}

function ramp(palette: Palette): string[] {
	return Array.from({ length: RAMP_STEPS }, (_, i) => oklchMix(palette.ramp[0], palette.ramp[1], i / (RAMP_STEPS - 1)));
}

function quantise(v: number, lo: number, hi: number): number {
	const t = (v - lo) / (hi - lo);
	return Math.min(RAMP_STEPS - 1, Math.max(0, Math.floor(t * RAMP_STEPS)));
}

export function buildColouring(by: ColourBy, facts: GameFacts, palette: Palette, currentYear: number): Colouring {
	const n = facts.weight.length;
	const bucketOf = new Uint8Array(n);
	switch (by) {
		case 'weight': {
			// BGG weight is 1–5; a game with no weight yet (most upcoming) sits at 0 → lightest.
			for (let i = 0; i < n; i++) bucketOf[i] = facts.weight[i] > 0 ? quantise(facts.weight[i], 1, 5) : 0;
			return { bucketOf, colours: ramp(palette), legend: [], domain: [1, 5] };
		}
		case 'year': {
			const lo = currentYear - 35;
			for (let i = 0; i < n; i++) bucketOf[i] = facts.year[i] ? quantise(facts.year[i], lo, currentYear) : 0;
			return { bucketOf, colours: ramp(palette), legend: [], domain: [lo, currentYear] };
		}
		case 'upcoming': {
			for (let i = 0; i < n; i++) bucketOf[i] = facts.upcoming[i];
			return {
				bucketOf,
				colours: [palette.muted, palette.accent],
				// PLACEHOLDER copy
				legend: [
					{ label: 'Established', bucket: 0 },
					{ label: 'Upcoming', bucket: 1 }
				]
			};
		}
		case 'category': {
			bucketOf.set(facts.category);
			const colours = [palette.muted, ...palette.chart];
			const legend = facts.categoryLabels.map((label, bucket) => ({ label, bucket }));
			// "Other" last in the legend, first in the buckets.
			return { bucketOf, colours, legend: [...legend.slice(1), legend[0]] };
		}
	}
}
