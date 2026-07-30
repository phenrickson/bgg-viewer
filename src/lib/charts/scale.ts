/**
 * How the shape strip's two series — the universe silhouette and the current scope — are
 * mapped to bar heights.
 *
 * Getting this wrong lies to you, and the wrong version is the tempting one. Scaling each
 * series to *its own* peak (so both fill the plot) means a bin can render taller in the scope
 * than in the universe. The scope is a subset, so that is impossible: filtering ratings to
 * 300+ drew the first surviving bar above the universe's own curve immediately beside it,
 * implying the filter had *added* games.
 *
 * Both modes here put the two series on ONE scale, so heights are always comparable.
 *
 * - `count` (default) — height is the number of games. Filtering on the very axis you are
 *   looking at then does the obvious thing: the coloured bars land exactly on the grey ones
 *   inside the window, because they are the same games, and the grey continues alone outside
 *   it. "Here is the part I kept."
 * - `share` — height is the bin's share of its own set. The cost of `count` is that a small
 *   scope is a flat line at the bottom: 45 games out of 10,000 spread over 40 bins cannot be
 *   seen, and the shape you drilled down to find is exactly what you have lost. `share`
 *   renormalises each series so both shapes are legible, and taller then means "a bigger
 *   share of my set than of the catalog" — a real comparison, just a different question.
 *
 * Neither is universally right, which is why the strip exposes the choice instead of picking
 * silently. Counts always live in the tooltip regardless.
 */
export type ScaleMode = 'count' | 'share';

export interface Bar {
	n: number;
}

export interface BarScale {
	/** Series totals, index-aligned with the input. `share` divides by these. */
	totals: number[];
	/** Height as a 0–1 fraction of the plot for a bar of `n` in a series totalling `total`. */
	frac(n: number, total: number): number;
}

const sum = (s: readonly Bar[]): number => {
	let t = 0;
	for (const b of s) t += b.n;
	return t;
};

const peak = (s: readonly Bar[]): number => {
	let m = 0;
	for (const b of s) if (b.n > m) m = b.n;
	return m;
};

export function barScale(series: readonly (readonly Bar[])[], mode: ScaleMode): BarScale {
	const totals = series.map(sum);

	if (mode === 'count') {
		// One denominator for every series: equal counts must draw at equal heights.
		const max = Math.max(...series.map(peak), 1);
		return { totals, frac: (n) => (n > 0 ? n / max : 0) };
	}

	// Each series against its own total, but the *shares* still share one denominator —
	// otherwise this reintroduces the per-series scaling the whole file exists to avoid.
	const maxShare = Math.max(
		...series.map((s, i) => (totals[i] > 0 ? peak(s) / totals[i] : 0)),
		Number.EPSILON
	);
	return {
		totals,
		frac: (n, total) => (n > 0 && total > 0 ? n / total / maxShare : 0)
	};
}
