import { describe, it, expect } from 'vitest';
import { DEFAULT_SCOPE } from '$lib/catalog/scope';
import { DEFAULT_VIEW } from './view';
import { MAP_PATH, mapHref, exploreHref } from './route';

describe('mapHref', () => {
	it('is the bare map path for the default scope', () => {
		expect(mapHref({ ...DEFAULT_SCOPE })).toBe('/map');
		expect(MAP_PATH).toBe('/map');
	});

	it('carries the scope', () => {
		expect(mapHref({ ...DEFAULT_SCOPE, q: 'wingspan' })).toBe('/map?q=wingspan');
	});

	it('carries the encodings when a view is passed', () => {
		const href = mapHref({ ...DEFAULT_SCOPE, q: 'wingspan' }, { ...DEFAULT_VIEW, colour: 'year' });
		expect(href.startsWith('/map?')).toBe(true);
		expect(new URL(href, 'http://x').searchParams.get('c')).toBe('year');
	});
});

describe('exploreHref', () => {
	it('points at Explore with the scope', () => {
		expect(exploreHref({ ...DEFAULT_SCOPE })).toBe('/games');
		expect(exploreHref({ ...DEFAULT_SCOPE, q: 'wingspan' })).toBe('/games?q=wingspan');
	});
});
