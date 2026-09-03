/**
 * Shared scales for the two badges on a "similar games" row: how *alike* two games are,
 * and how *well-rated* the neighbour is. Extracted so the game-detail page and the dev
 * tuning bench (`/dev/similar`) render them identically.
 */

/** Cosine distance (0 = identical) → similarity on 0..1. The warehouse ships distance. */
export function similarityFromDistance(distance: number): number {
	return 1 - distance;
}

/**
 * 0..1 similarity → 0..100, clamped: 1 and 0 are real anchors (exact match / no relation),
 * and the clamp guards the rare negative cosine-distance edge case rather than trusting it.
 */
export function similarityPct(s: number): number {
	return Math.max(0, Math.min(100, s * 100));
}

/**
 * Diverging, matching Scatter.svelte's `div()`: rose below the pivot ("more unlike than
 * like"), blue above, pale where they meet. Pivot at 0.5 — the meaningful midpoint of a
 * 0..1 similarity measure. Returns a text colour.
 */
export function similarityColor(s: number): string {
	const u = similarityPct(s) / 100;
	const d = Math.abs(u - 0.5) * 2;
	const hue = u < 0.5 ? 25 : 250;
	return `oklch(${0.85 - 0.3 * d} ${0.03 + 0.14 * d} ${hue})`;
}

/**
 * Geek rating → a sequential single-hue (green) quality colour, pale→saturated as the
 * rating climbs across the band that actually varies (≈5.5–8.5; almost nothing with a geek
 * rating sits outside it). Null / 0 means "no geek rating yet" — a neutral grey, not a bad
 * score. Returns a text colour, same usage as `similarityColor`.
 */
export function ratingColor(geek: number | null | undefined): string {
	if (geek == null || geek <= 0) return 'var(--muted-foreground)';
	const t = Math.max(0, Math.min(1, (geek - 5.5) / 3));
	return `oklch(${0.8 - 0.18 * t} ${0.04 + 0.13 * t} 150)`;
}

/**
 * Complexity (1..5) → a blue(light)→orange→red(heavy) ramp. Two fixed hues that switch at
 * the midpoint, never sweeping through green/yellow — lightness and chroma carry the value
 * within each half. Same construction as `ComplexityMeter`, which imports this. Null / 0 is
 * "not weighted yet" — neutral grey.
 */
export function complexityColor(weight: number | null | undefined): string {
	if (weight == null || weight <= 0) return 'var(--muted-foreground)';
	const u = Math.max(0, Math.min(1, (weight - 1) / 4));
	if (u < 0.5) {
		const t = u / 0.5;
		return `oklch(${0.78 - 0.18 * t} ${0.05 + 0.11 * t} 245)`;
	}
	const t = (u - 0.5) / 0.5;
	return `oklch(${0.72 - 0.18 * t} ${0.14 + 0.05 * t} ${55 - 33 * t})`;
}
