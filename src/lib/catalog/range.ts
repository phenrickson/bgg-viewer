/**
 * Helpers for the rail's two-handle range sliders.
 *
 * The slider element always holds two concrete numbers — a range input has no concept of "no
 * limit" — but the scope fields it writes are nullable, where `null` means unbounded. These
 * functions own that translation in both directions, plus the label that reads the range back
 * to the user.
 *
 * They live here rather than in the component so they can be unit-tested: this repo has no
 * component-test harness, and the edge cases (a handle parked at a boundary, one-sided ranges,
 * a range that covers everything) are exactly the parts worth pinning down.
 */

/** The inclusive numeric span a slider covers. */
export type Domain = { lo: number; hi: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Snap to `step` and shed binary-float noise, so dragging never emits 2.9000000000000004 into
 * the URL or a chip.
 */
export function quantize(n: number, step: number): number {
	const snapped = Math.round(n / step) * step;
	// `step` is a decimal like 0.1 / 0.25; four places is well past any step we use and short
	// enough to keep the value printable.
	return Math.round(snapped * 10000) / 10000;
}

/**
 * Slider positions → scope bounds. A handle at its outer edge means "no limit", not the
 * boundary number: `weightMin: 1` would add a chip and a WHERE clause that exclude nothing,
 * and it would be indistinguishable from a user who deliberately bounded at the minimum.
 *
 * Mirrors what the shape strip's brush already emits when you drag past an edge.
 */
export function toBounds(
	lo: number,
	hi: number,
	domain: Domain,
	step: number
): { min: number | null; max: number | null } {
	// Tolerate crossed handles rather than trusting the caller's ordering.
	const a = quantize(clamp(Math.min(lo, hi), domain.lo, domain.hi), step);
	const b = quantize(clamp(Math.max(lo, hi), domain.lo, domain.hi), step);
	return {
		min: a <= domain.lo ? null : a,
		max: b >= domain.hi ? null : b
	};
}

/**
 * Scope bounds → slider positions. The inverse of `toBounds`: `null` parks the handle at its
 * edge, so a scope arriving from a URL or a strip brush lands on handles that match it.
 */
export function toHandles(
	min: number | null,
	max: number | null,
	domain: Domain
): { lo: number; hi: number } {
	const lo = clamp(min ?? domain.lo, domain.lo, domain.hi);
	const hi = clamp(max ?? domain.hi, domain.lo, domain.hi);
	// A URL can carry min > max; show it as an empty-but-valid slider rather than crossed
	// handles that fight the user's next drag.
	return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
}

/**
 * The range as a short string for the group label, so the current filter is legible without
 * hunting for its chip. Unbounded sides read as an open range rather than printing the
 * domain's own edge back at the user.
 */
export function rangeLabel(
	min: number | null,
	max: number | null,
	format: (n: number) => string = String
): string {
	if (min == null && max == null) return '';
	if (min == null) return `up to ${format(max as number)}`;
	if (max == null) return `${format(min)}+`;
	if (min === max) return format(min);
	return `${format(min)} – ${format(max)}`;
}
