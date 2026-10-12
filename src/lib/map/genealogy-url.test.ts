import { describe, it, expect } from 'vitest';
import { fromParams, toParams, currentState, startAt, fold, showFewer, DEFAULT_THRESHOLD, type GenealogyState } from './genealogy-url';
import type { Genealogy, GenealogyNode } from './genealogy';

describe('genealogy URL state', () => {
	it('defaults from an empty URL', () => {
		expect(fromParams(new URLSearchParams())).toEqual({
			game: null, t: DEFAULT_THRESHOLD, y: 'year', same: false, unfolded: [], expanded: []
		});
	});
	it('round-trips a full state', () => {
		const s: GenealogyState = { game: 102794, t: 0.72, y: 'gen', same: true, unfolded: [31260, 3076], expanded: ['31260:up'] };
		expect(fromParams(toParams(s))).toEqual(s);
	});
	it('writes nothing for defaults', () => {
		expect(toParams(fromParams(new URLSearchParams())).toString()).toBe('');
	});
	it('drops junk instead of throwing', () => {
		const s = fromParams(new URLSearchParams('game=abc&t=7&y=sideways&u=1,x,,-3&a=5:up,6:sideways,bad'));
		expect(s).toEqual({ game: null, t: DEFAULT_THRESHOLD, y: 'year', same: false, unfolded: [1], expanded: ['5:up'] });
	});
	it('clamps a hand-edited threshold to the slider range', () => {
		expect(fromParams(new URLSearchParams('t=0.05')).t).toBe(0.5);
		expect(fromParams(new URLSearchParams('t=0.999')).t).toBe(0.99);
	});
});

describe('currentState', () => {
	// SvelteKit's shallow pushState/replaceState update page.state, never page.url: the
	// state a click committed must win over the (stale) URL the page was loaded with.
	const committed: GenealogyState = { game: 31260, t: 0.7, y: 'gen', same: false, unfolded: [3076], expanded: [] };
	it('prefers the shallow-routing state over the URL', () => {
		expect(currentState({ genealogy: committed }, new URL('http://x/dev/genealogy?game=102794'))).toEqual(committed);
	});
	it('falls back to the URL on a fresh load or a pasted link', () => {
		expect(currentState({}, new URL('http://x/dev/genealogy?game=102794')).game).toBe(102794);
	});
});

describe('startAt', () => {
	it('a fresh tree on a game: nothing unfolded or expanded, settings kept', () => {
		const s: GenealogyState = { game: 1, t: 0.7, y: 'gen', same: true, unfolded: [2, 3], expanded: ['2:up'] };
		expect(startAt(s, 9)).toEqual({ game: 9, t: 0.7, y: 'gen', same: true, unfolded: [], expanded: [] });
		expect(startAt(s)).toEqual({ ...s, unfolded: [], expanded: [] }); // Reset: same game
	});
});

describe('fold / showFewer', () => {
	// Indices 0..5 are game ids 100..105. Tree: 0 centre; 1 up (unfolded) → 2 up (unfolded) → 3 up;
	// 4 down (unfolded) → 5 down.
	const node = (i: number, side: GenealogyNode['side'], via: number, unfolded = false): GenealogyNode =>
		({ i, side, gen: 0, via, sim: 0.9, kind: 'influence', unfolded, hidden: 0 });
	const tree: Genealogy = {
		centre: 0, placeable: true, centreHidden: { up: 0, down: 0, same: 0 },
		nodes: [node(0, 'centre', -1, true), node(1, 'up', 0, true), node(2, 'up', 1, true), node(3, 'up', 2), node(4, 'down', 0, true), node(5, 'down', 4)]
	};
	const ids = Int32Array.from([100, 101, 102, 103, 104, 105]);
	const s: GenealogyState = {
		game: 100, t: 0.8, y: 'year', same: false, unfolded: [101, 102, 104], expanded: ['101:up', '102:up', '104:down', '100:up']
	};
	it('folding a game forgets it and every unfold beneath it, on its side only', () => {
		expect(fold(s, tree, ids, 1)).toEqual({ ...s, unfolded: [104], expanded: ['104:down', '100:up'] });
	});
	it('showFewer drops one expansion and nothing else', () => {
		expect(showFewer(s, 100, 'up')).toEqual({ ...s, expanded: ['101:up', '102:up', '104:down'] });
	});
});
