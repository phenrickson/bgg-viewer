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
import { ratingColor, complexityColor } from '$lib/game/similarity';
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
export const RADIUS_UNIFORM = 2.5;

/** log-popularity → px. Anchors: 30 ratings ≈ min, 100k ratings ≈ max. Uniform mode
 * ignores popularity so colour is the only encoding left to read. */
export function radiusFor(usersRated: number, upcoming: boolean, uniform = false): number {
	if (uniform) return upcoming ? RADIUS_UPCOMING : RADIUS_UNIFORM;
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
	/**
	 * Continuous encodings: bucket 0 is "no value" (muted), buckets 1..RAMP_STEPS span
	 * `domain` low→high. The legend draws `colours.slice(1)` as a bar with these end labels.
	 */
	domain?: [number, number];
	/** Diverging encodings: the pivot value, for the legend's middle label. */
	mid?: number;
}

/** The map's own blue ramp from the two `--map-ramp-*` tokens (theme-aware). */
function tokenRamp(palette: Palette): string[] {
	return Array.from({ length: RAMP_STEPS }, (_, i) => oklchMix(palette.ramp[0], palette.ramp[1], i / (RAMP_STEPS - 1)));
}

/** Sample one of the app's existing value→colour functions at each bucket's midpoint, so the
 * map grades a measure exactly the way the game page does. */
function sampledRamp(fn: (v: number) => string, lo: number, hi: number): string[] {
	return Array.from({ length: RAMP_STEPS }, (_, i) => fn(lo + ((i + 0.5) / RAMP_STEPS) * (hi - lo)));
}

/**
 * Diverging: cool blue below `mid`, neutral grey at it, warm orange→red above — two hues with
 * a grey midpoint, never sweeping through green. Each half is its own lightness/chroma ramp,
 * same construction as `complexityColor`. Literal oklch like similarity.ts, so it reads the
 * same in both themes.
 */
export function divergingColor(v: number, lo: number, mid: number, hi: number): string {
	if (v < mid) {
		const t = Math.max(0, Math.min(1, (mid - v) / (mid - lo)));
		return `oklch(${0.7 - 0.12 * t} ${0.02 + 0.13 * t} 250)`;
	}
	const t = Math.max(0, Math.min(1, (v - mid) / (hi - mid)));
	return `oklch(${0.7 - 0.1 * t} ${0.02 + 0.17 * t} ${60 - 35 * t})`;
}

/** 1..RAMP_STEPS for a value in [lo, hi] (clamped); callers reserve 0 for "no value". */
function quantise(v: number, lo: number, hi: number): number {
	const t = (v - lo) / (hi - lo);
	return 1 + Math.min(RAMP_STEPS - 1, Math.max(0, Math.floor(t * RAMP_STEPS)));
}

function continuous(
	values: ArrayLike<number>,
	lo: number,
	hi: number,
	ramp: string[],
	palette: Palette
): Colouring {
	const n = values.length;
	const bucketOf = new Uint8Array(n);
	for (let i = 0; i < n; i++) bucketOf[i] = values[i] > 0 ? quantise(values[i], lo, hi) : 0;
	return { bucketOf, colours: [palette.muted, ...ramp], legend: [], domain: [lo, hi] };
}

export function buildColouring(by: ColourBy, facts: GameFacts, palette: Palette, currentYear: number): Colouring {
	const n = facts.weight.length;
	const bucketOf = new Uint8Array(n);
	switch (by) {
		// Weight and geek rating use the game page's own colour functions (similarity.ts) so a
		// game reads the same colour here as on its detail page. Same domains as there.
		case 'weight':
			return continuous(facts.weight, 1, 5, sampledRamp(complexityColor, 1, 5), palette);
		case 'geek': {
			// Diverging, pivot 6.0: half of all games sit in 5.49–5.54 and 90% under 6.04, so a
			// sequential ramp over 5.5–8.5 painted the whole map one shade. Below the pivot the
			// prior dominates (cool, receding); above it the rating means something (warm, loud).
			const c = continuous(facts.geekRating, 5.5, 8.5, sampledRamp((v) => divergingColor(v, 5.5, 6, 8.5), 5.5, 8.5), palette);
			return { ...c, mid: 6 };
		}
		case 'rating':
			// Average rating has no colour function of its own; borrow the geek ramp's look across
			// average's wider 5–9 band.
			return continuous(facts.averageRating, 5, 9, sampledRamp((v) => ratingColor(5.5 + ((v - 5) / 4) * 3), 5, 9), palette);
		case 'year':
			return continuous(facts.year, currentYear - 35, currentYear, tokenRamp(palette), palette);
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
