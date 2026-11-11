import { describe, it, expect, vi, afterEach } from 'vitest';
import { Glide } from './glide.svelte';

/** Drive the glide's frames by hand: `frame(ms)` runs what it queued, at `ms` after the start. */
function clock() {
	let now = 0;
	let queued: ((t: number) => void)[] = [];
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => (queued.push(cb), queued.length));
	vi.stubGlobal('cancelAnimationFrame', () => { queued = []; });
	return {
		frame(ms: number) {
			now = ms;
			const run = queued;
			queued = [];
			for (const cb of run) cb(ms);
		}
	};
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const at = (n: number) => ({ x: Float32Array.from({ length: n }, (_, i) => i), y: new Float32Array(n) });
// Centre 0; 1 and 2 hang off it, 3 off 1.
const tree = { centre: 0, nodes: [{ i: 0, via: -1 }, { i: 1, via: 0 }, { i: 2, via: 0 }, { i: 3, via: 1 }] };

describe('Glide intro', () => {
	it('grows the chosen game in first, then its games one at a time in order', () => {
		const c = clock();
		const g = new Glide(5);
		g.to(tree, at(5));
		c.frame(100); // inside the lead: only the centre has started
		expect(g.grow[0]).toBeGreaterThan(0);
		expect([g.grow[1], g.grow[2], g.grow[3]]).toEqual([0, 0, 0]);
		c.frame(300); // one beat past the lead: the first of the rest is out, the others not yet
		expect(g.grow[1]).toBeGreaterThan(0);
		expect([g.grow[2], g.grow[3]]).toEqual([0, 0]);
		expect(g.cur.x[1]).toBeGreaterThan(0); // and it travels out of the centre
		c.frame(5000);
		expect([...g.grow]).toEqual([1, 1, 1, 1, 1]);
		expect(g.cur.x[3]).toBe(3);
	});

	it('sized scales only the entering games, and hands back size itself once they land', () => {
		const c = clock();
		const g = new Glide(5);
		const size = Uint8Array.from([10, 10, 10, 10, 10]);
		g.to(tree, at(5));
		c.frame(300);
		const s = g.sized(size);
		expect(s).not.toBe(size);
		expect(s[2]).toBe(0);
		expect(s[4]).toBe(10); // not in the view: untouched
		c.frame(5000);
		expect(g.sized(size)).toBe(size);
	});

	it('a later change grows only the games new to the view', () => {
		const c = clock();
		const g = new Glide(6);
		g.to(tree, at(6));
		c.frame(5000);
		g.to({ ...tree, nodes: [...tree.nodes, { i: 5, via: 2 }] }, at(6));
		expect(g.grow[5]).toBe(0);
		expect([g.grow[0], g.grow[1], g.grow[2], g.grow[3]]).toEqual([1, 1, 1, 1]);
	});
});
