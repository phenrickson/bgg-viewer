import { describe, it, expect } from 'vitest';
import { findHref, RECOMMEND_PATH } from './route';

describe('findHref', () => {
	it('opens Help me find a game', () => {
		expect(findHref()).toBe(`${RECOMMEND_PATH}?tab=find`);
	});

	it("carries an old Discover link's answers", () => {
		expect(findHref('?best=4&mechs=Cooperative+Game')).toBe('/recommend?tab=find&best=4&mechs=Cooperative+Game');
	});

	it('never doubles the tab param', () => {
		expect(findHref('?tab=find&wmax=2')).toBe('/recommend?tab=find&wmax=2');
	});
});
