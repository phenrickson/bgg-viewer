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

	it('stays inside the 60 KB gzipped budget — this ships in the JS bundle', () => {
		const gz = gzipSync(Buffer.from(JSON.stringify(landing))).length;
		expect(gz).toBeLessThan(60 * 1024);
	});
});
