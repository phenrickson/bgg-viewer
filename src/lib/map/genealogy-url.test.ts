import { describe, it, expect } from 'vitest';
import { fromParams, toParams, DEFAULT_THRESHOLD, type GenealogyState } from './genealogy-url';

describe('genealogy URL state', () => {
	it('defaults from an empty URL', () => {
		expect(fromParams(new URLSearchParams())).toEqual({
			game: null, t: DEFAULT_THRESHOLD, y: 'year', unfolded: [], expanded: [], trail: []
		});
	});
	it('round-trips a full state', () => {
		const s: GenealogyState = { game: 102794, t: 0.72, y: 'gen', unfolded: [31260, 3076], expanded: ['31260:up'], trail: [177736] };
		expect(fromParams(toParams(s))).toEqual(s);
	});
	it('writes nothing for defaults', () => {
		expect(toParams(fromParams(new URLSearchParams())).toString()).toBe('');
	});
	it('drops junk instead of throwing', () => {
		const s = fromParams(new URLSearchParams('game=abc&t=7&y=sideways&u=1,x,,-3&a=5:up,6:sideways,bad&trail=0'));
		expect(s).toEqual({ game: null, t: DEFAULT_THRESHOLD, y: 'year', unfolded: [1], expanded: ['5:up'], trail: [] });
	});
});
