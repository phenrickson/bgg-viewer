import { describe, it, expect } from 'vitest';
import { fromParams, toParams, currentState, DEFAULT_THRESHOLD, type GenealogyState } from './genealogy-url';

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
	it('clamps a hand-edited threshold to the slider range', () => {
		expect(fromParams(new URLSearchParams('t=0.05')).t).toBe(0.5);
		expect(fromParams(new URLSearchParams('t=0.999')).t).toBe(0.99);
	});
});

describe('currentState', () => {
	// SvelteKit's shallow pushState/replaceState update page.state, never page.url: the
	// state a click committed must win over the (stale) URL the page was loaded with.
	const committed: GenealogyState = { game: 31260, t: 0.7, y: 'gen', unfolded: [3076], expanded: [], trail: [102794] };
	it('prefers the shallow-routing state over the URL', () => {
		expect(currentState({ genealogy: committed }, new URL('http://x/dev/genealogy?game=102794'))).toEqual(committed);
	});
	it('falls back to the URL on a fresh load or a pasted link', () => {
		expect(currentState({}, new URL('http://x/dev/genealogy?game=102794')).game).toBe(102794);
	});
});
