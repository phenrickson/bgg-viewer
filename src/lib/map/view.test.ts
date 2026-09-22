import { describe, it, expect } from 'vitest';
import { fromParams, toParams, DEFAULT_VIEW, type ViewState } from './view';

const K = 6;

describe('view ⇄ params', () => {
	it('an empty URL is the default view, and the default view is an empty URL', () => {
		expect(fromParams(new URLSearchParams(), K)).toEqual(DEFAULT_VIEW);
		expect(toParams(DEFAULT_VIEW).toString()).toBe('');
	});

	it('round-trips a fully non-default view', () => {
		const view: ViewState = {
			projection: 'pca',
			x: 3,
			y: 5,
			colour: 'category',
			size: 'uniform',
			xFact: 'weight',
			yFact: 'rating',
			context: 'dim'
		};
		expect(fromParams(toParams(view), K)).toEqual(view);
	});

	it('carries encodings ONLY — nothing here decides which games are drawn', () => {
		// The map's three old filters (minRatings, upcoming, categories) and its selection now
		// live in `Scope`, so one filter language serves the list and the plot. If a filter
		// ever creeps back into this type, that guarantee is gone and this test says so.
		// `xFact`/`yFact` are encodings too — WHICH quantity an axis shows, the same kind of
		// choice as which component. The guarantee this pins is that no FILTER appears here.
		expect(Object.keys(DEFAULT_VIEW).sort()).toEqual([
			'colour',
			'context',
			'projection',
			'size',
			'x',
			'xFact',
			'y',
			'yFact'
		]);
	});

	it('ignores the scope params that share its querystring', () => {
		// Both halves of the map's state live in one URL; the view must not react to the
		// scope's keys (or vice versa) just because they travel together.
		const v = fromParams(new URLSearchParams('cats=Wargame&urmin=500&lasso=1,2&u=upcoming'), K);
		expect(v).toEqual(DEFAULT_VIEW);
		expect(toParams(DEFAULT_VIEW).toString()).toBe('');
	});

	it('drops axis params when projecting with UMAP, since they do not apply', () => {
		const p = toParams({ ...DEFAULT_VIEW, projection: 'umap', x: 3, y: 4 });
		expect(p.get('p')).toBe('umap');
		expect(p.has('x')).toBe(false);
		expect(p.has('y')).toBe(false);
	});

	it('keeps the component but drops y for a strip, which has no y axis', () => {
		const p = toParams({ ...DEFAULT_VIEW, projection: 'strip', x: 3, y: 4 });
		expect(p.get('x')).toBe('3');
		expect(p.has('y')).toBe(false);
	});

	it('falls back on junk and out-of-range values', () => {
		const v = fromParams(new URLSearchParams('p=tsne&x=9&y=0&c=mood&s=huge'), K);
		expect(v.projection).toBe('pca');
		expect(v.x).toBe(1);
		expect(v.y).toBe(2);
		expect(v.colour).toBe('weight');
		expect(v.size).toBe('popularity');
	});

	it('bounds the axis pickers by the components the artifact actually carries', () => {
		expect(fromParams(new URLSearchParams('x=5'), 3).x).toBe(1);
		expect(fromParams(new URLSearchParams('x=3'), 3).x).toBe(3);
	});

	it('never plots a component against itself', () => {
		expect(fromParams(new URLSearchParams('x=2&y=2'), K)).toMatchObject({ x: 2, y: 1 });
		expect(fromParams(new URLSearchParams('x=1&y=1'), K)).toMatchObject({ x: 1, y: 2 });
	});
});
