import { describe, it, expect } from 'vitest';
import { fromParams, toParams, DEFAULT_VIEW, MIN_RATINGS_FLOOR } from './view';

const K = 6;

describe('view ⇄ params', () => {
	it('an empty URL is the default view, and the default view is an empty URL', () => {
		expect(fromParams(new URLSearchParams(), K)).toEqual(DEFAULT_VIEW);
		expect(toParams(DEFAULT_VIEW).toString()).toBe('');
	});

	it('round-trips a fully non-default view', () => {
		const view = {
			projection: 'pca' as const,
			x: 3,
			y: 5,
			colour: 'category' as const,
			size: 'uniform' as const,
			upcoming: false,
			minRatings: 500,
			categories: [1, 3],
			selected: 224517
		};
		expect(fromParams(toParams(view), K)).toEqual(view);
	});

	it('drops axis params when projecting with UMAP, since they do not apply', () => {
		const p = toParams({ ...DEFAULT_VIEW, projection: 'umap', x: 3, y: 4 });
		expect(p.get('p')).toBe('umap');
		expect(p.has('x')).toBe(false);
	});

	it('falls back on junk and out-of-range values', () => {
		const v = fromParams(new URLSearchParams('p=tsne&x=9&y=0&c=mood&r=5&g=-1'), K);
		expect(v.projection).toBe('pca');
		expect(v.x).toBe(1);
		expect(v.y).toBe(2);
		expect(v.colour).toBe('weight');
		expect(v.minRatings).toBe(MIN_RATINGS_FLOOR);
		expect(v.selected).toBeNull();
	});

	it('parses a category filter, dropping junk and duplicates', () => {
		expect(fromParams(new URLSearchParams('cat=3,1,x,3,9'), K).categories).toEqual([1, 3]);
		expect(fromParams(new URLSearchParams('cat='), K).categories).toBeNull();
	});

	it('never plots a component against itself', () => {
		expect(fromParams(new URLSearchParams('x=2&y=2'), K)).toMatchObject({ x: 2, y: 1 });
		expect(fromParams(new URLSearchParams('x=1&y=1'), K)).toMatchObject({ x: 1, y: 2 });
	});
});
