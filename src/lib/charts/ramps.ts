/**
 * The app's two value→colour ramps for continuous scales, on a unit input `u ∈ [0, 1]`.
 * Shared by `Scatter.svelte` (Explore / About clouds) and the embedding map so a measure
 * grades identically everywhere. These are *scales*, so the categorical `--chart-N` tokens
 * would be exactly wrong: unrelated hues imply kinds, not an ordering.
 *
 * OKLCH so the steps are perceptually even; the same interpolation in sRGB bunches its
 * lightness at one end and reads as a broken scale.
 */

/** Sequential: one hue, pale-and-desaturated to dark-and-saturated. */
export function seq(u: number): string {
	return `oklch(${0.86 - 0.34 * u} ${0.04 + 0.13 * u} 250)`;
}

/**
 * Diverging: rose below the pivot (u = 0.5), blue above, pale where the two meet.
 *
 * Only correct when the midpoint carries meaning — e.g. geek rating pivoted at 6 separates
 * "rated worse than indifferent" from "better". Both arms are colourblind-safe against each
 * other (rose/blue, not red/green), and lightness carries the magnitude on both sides so
 * the scale survives greyscale.
 */
export function div(u: number): string {
	const d = Math.abs(u - 0.5) * 2; // 0 at the pivot, 1 at either end
	const hue = u < 0.5 ? 25 : 250;
	return `oklch(${0.85 - 0.3 * d} ${0.03 + 0.14 * d} ${hue})`;
}

/**
 * Map a value in [lo, hi] onto the diverging ramp with the pale point at `pivot` — the two
 * arms are stretched independently so the pivot need not be the arithmetic middle.
 */
export function divergingAt(v: number, lo: number, pivot: number, hi: number): string {
	const clamp = (t: number) => Math.max(0, Math.min(1, t));
	const u = v < pivot ? 0.5 * clamp((v - lo) / (pivot - lo)) : 0.5 + 0.5 * clamp((v - pivot) / (hi - pivot));
	return div(u);
}
