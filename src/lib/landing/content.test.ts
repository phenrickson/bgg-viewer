import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { landingContent as landing } from './content';
import type { Viz } from './types';

/**
 * The committed snapshot is what every credential-less build renders — local dev, a fresh
 * clone, and any CI run where the generator step failed. A malformed one is therefore a
 * broken landing page for exactly the people least able to diagnose it.
 */
const isViz = (v: Viz) => {
	if (v.kind === 'scatter') return v.points.length > 0;
	if (v.kind === 'columns') return v.bins.length > 0;
	if (v.kind === 'line' || v.kind === 'stack') return v.series.length > 0 && v.points.length > 0;
	if (v.kind === 'range') return v.points.length > 0;
	if (v.kind === 'ridge') return v.grid.length > 0 && v.lanes.length > 0;
	return v.bars.length > 0;
};

describe('content.json', () => {
	it('carries stats the pill can render', () => {
		expect(landing.stats.games).toBeGreaterThan(1000);
		expect(landing.stats.newestYear).toBeGreaterThan(2000);
	});

	it('has enough of each kind to rotate — four slots, seeded +1, need two of each', () => {
		expect(landing.vizzes.length).toBeGreaterThanOrEqual(2);
		expect(landing.featured.length).toBeGreaterThanOrEqual(2);
	});

	it('has no empty chart — an empty one renders as a blank section, not an error', () => {
		for (const v of landing.vizzes) {
			expect(isViz(v), `${v.kind}: ${v.title}`).toBe(true);
			expect(v.title.length).toBeGreaterThan(0);
		}
	});

	it('every featured game can render its card and link somewhere real', () => {
		for (const g of landing.featured) {
			expect(Number.isInteger(g.id) && g.id > 0, g.name).toBe(true);
			expect(g.name.length).toBeGreaterThan(0);
			expect(g.usersRated).toBeGreaterThan(0);
		}
	});

	it('names real games on every cloud, spread across the x range', () => {
		for (const v of landing.vizzes) {
			if (v.kind !== 'scatter') continue;
			const a = v.annotations ?? [];
			expect(a.length, v.title).toBeGreaterThanOrEqual(2);
			expect(a.every((p) => p.label.trim().length > 0), v.title).toBe(true);

			// Spread is the whole point of the AUTOMATIC pick — `label()` buckets by x
			// precisely so the callouts do not all land in one corner, which teaches nothing
			// about the axis. A small, deliberately curated list (`opts.highlights` — see
			// `08-popularity-vs-rating.viz.js`) is an editorial choice instead, and the games
			// on it may legitimately cluster wherever they actually sit.
			if (a.length < 4) continue;

			// Measured in the space the axis actually renders in — same reasoning as the
			// "squash the cloud" test below. A log axis (e.g. playtime, spanning 1 minute to
			// multi-day outliers) has its buckets spaced by log10, so judging spread on raw
			// linear position makes six well-spread labels look clustered in one corner just
			// because the far end of a LINEAR reading of a five-decade domain is mostly empty.
			const tx = (v.xLog ?? false) ? (n: number) => Math.log10(Math.max(1, n)) : (n: number) => n;
			const xs = v.points.map((p) => tx(p[0]));
			const lo = Math.min(...xs);
			const hi = Math.max(...xs);
			const at = a.map((p) => (tx(p.x) - lo) / (hi - lo));
			expect(Math.max(...at) - Math.min(...at), v.title).toBeGreaterThan(0.4);
		}
	});

	it('no annotation stretches its axis far enough to squash the cloud', () => {
		/*
		 * Annotations are NOT drawn from the plotted sample — the cloud is stratified across
		 * ratings, the labels are chosen for recognition — so a named game legitimately sits
		 * outside the sample's range (Monopoly's 4.29 geek rating against a sample floor of
		 * 5.32). `Scatter` widens its domain to include them rather than clipping them.
		 *
		 * What must not happen is a label so far out that the cloud collapses into a corner.
		 * Measured in the space the chart actually scales in, so a log axis is judged on its
		 * logged span — raw, the popularity axis "stretches" 136%; logged, it is 8%.
		 */
		const span = (vals: number[], log: boolean) => {
			const t = log ? vals.map((v) => Math.log10(Math.max(1, v))) : vals;
			return [Math.min(...t), Math.max(...t)] as const;
		};

		for (const v of landing.vizzes) {
			if (v.kind !== 'scatter') continue;
			for (const [axis, i, log] of [
				['x', 0, !!v.xLog],
				['y', 1, !!v.yLog]
			] as const) {
				const pts = v.points.map((p) => p[i]);
				const anns = (v.annotations ?? []).map((a) => (i === 0 ? a.x : a.y));
				if (!anns.length) continue;

				const [plo, phi] = span(pts, log);
				const [alo, ahi] = span([...pts, ...anns], log);
				const growth = (ahi - alo) / (phi - plo) - 1;
				expect(growth, `${v.title} ${axis}`).toBeLessThan(0.5);
			}
		}
	});

	it('a callout points at the bucket it describes, and that is the tallest one', () => {
		for (const v of landing.vizzes) {
			if (v.kind !== 'columns' || !v.callout) continue;
			const peak = v.bins.reduce((a, b) => (b[1] > a[1] ? b : a), v.bins[0]);
			// The highlighted bar and the sentence must agree, or the chart argues with itself.
			expect(v.callout.at, v.title).toBe(peak[0]);
			expect(v.bins.some(([x]) => x === v.callout!.at), v.title).toBe(true);
			expect(v.callout.text.length, v.title).toBeGreaterThan(20);
		}
	});

	it('stays inside the 60 KB gzipped budget — this ships in the JS bundle', () => {
		const gz = gzipSync(Buffer.from(JSON.stringify(landing))).length;
		expect(gz).toBeLessThan(60 * 1024);
	});
});
