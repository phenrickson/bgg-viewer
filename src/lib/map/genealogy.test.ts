import { describe, it, expect } from 'vitest';
import { buildGenealogy, expandKey, linkKind, linked, type GenealogyInput, type GenealogyOpts, type Link } from './genealogy';

/**
 * Unit vectors in 2-d at the given angles; cos(Δangle) is the similarity, so with the
 * default threshold 0.9 two games link when their angles are within ~0.45 rad.
 * Game ids are 100 + index.
 */
function input(rows: { a: number; y: number; fam?: number[]; rel?: number[]; has?: boolean }[]): GenealogyInput {
	const emb = new Float32Array(rows.length * 2);
	rows.forEach((r, i) => { emb[i * 2] = Math.cos(r.a); emb[i * 2 + 1] = Math.sin(r.a); });
	return {
		n: rows.length, dim: 2, emb,
		ids: Int32Array.from(rows, (_, i) => 100 + i),
		year: Int16Array.from(rows, (r) => r.y),
		families: rows.map((r) => r.fam ?? []),
		related: rows.map((r) => r.rel ?? []),
		has: (i) => rows[i].has !== false
	};
}
const opts = (o: Partial<GenealogyOpts> = {}): GenealogyOpts =>
	({ threshold: 0.9, cap: 8, unfolded: new Set(), expanded: new Set(), same: true, ...o });
const at = (g: ReturnType<typeof buildGenealogy>, i: number) => g.nodes.find((n) => n.i === i);

describe('buildGenealogy', () => {
	it('splits linked games by year: earlier up, later down, same year beside', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2007 }, { a: 0.2, y: 2016 }, { a: 0.15, y: 2013 }, { a: 1.5, y: 2000 }]);
		const g = buildGenealogy(d, 0, opts());
		expect(g.nodes[0]).toMatchObject({ i: 0, side: 'centre', gen: 0 });
		expect(at(g, 1)).toMatchObject({ side: 'up', gen: -1, via: 0 });
		expect(at(g, 2)).toMatchObject({ side: 'down', gen: 1, via: 0 });
		expect(at(g, 3)).toMatchObject({ side: 'same', gen: 0, via: 0 });
		expect(at(g, 4)).toBeUndefined(); // not similar enough
	});

	it("chains: a parent's parents come from the parent, not the centre", () => {
		// sim(0,2) = cos 0.7 ≈ 0.76 < 0.9, sim(1,2) = cos 0.4 ≈ 0.92
		const d = input([{ a: 0, y: 2013 }, { a: 0.3, y: 2007 }, { a: 0.7, y: 2005 }]);
		const closed = buildGenealogy(d, 0, opts());
		expect(at(closed, 2)).toBeUndefined();
		expect(at(closed, 1)).toMatchObject({ unfolded: false, hidden: 1 });
		const open = buildGenealogy(d, 0, opts({ unfolded: new Set([1]) }));
		expect(at(open, 1)).toMatchObject({ unfolded: true, hidden: 0 });
		expect(at(open, 2)).toMatchObject({ side: 'up', gen: -2, via: 1 });
	});

	it('places each game once, under the game it was first reached through', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2010 }, { a: 0.2, y: 2008 }]);
		const g = buildGenealogy(d, 0, opts({ unfolded: new Set([1]) }));
		expect(g.nodes.filter((n) => n.i === 2)).toHaveLength(1);
		expect(at(g, 2)!.via).toBe(0);
		expect(at(g, 1)!.hidden).toBe(0); // 2 is already in the tree, so not "more"
	});

	it('caps each unfold and counts the rest; expanding shows them all', () => {
		const d = input([{ a: 0, y: 2013 }, ...[1, 2, 3, 4, 5].map((k) => ({ a: k * 0.01, y: 2000 + k }))]);
		const capped = buildGenealogy(d, 0, opts({ cap: 2 }));
		expect(capped.nodes.filter((n) => n.side === 'up').map((n) => n.i)).toEqual([1, 2]); // strongest first
		expect(capped.centreHidden.up).toBe(3);
		const all = buildGenealogy(d, 0, opts({ cap: 2, expanded: new Set([expandKey(0, 'up')]) }));
		expect(all.nodes.filter((n) => n.side === 'up')).toHaveLength(5);
		expect(all.centreHidden.up).toBe(0);
	});

	it('leaves same-year games out entirely when asked', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2007 }, { a: 0.15, y: 2013 }]);
		const g = buildGenealogy(d, 0, opts({ same: false }));
		expect(g.nodes.some((n) => n.side === 'same')).toBe(false);
		expect(g.centreHidden.same).toBe(0);
		expect(at(g, 1)).toMatchObject({ side: 'up' });
	});

	it('caps the same-year row too', () => {
		const d = input([{ a: 0, y: 2013 }, ...[1, 2, 3, 4].map((k) => ({ a: k * 0.01, y: 2013 }))]);
		const g = buildGenealogy(d, 0, opts({ cap: 2 }));
		expect(g.nodes.filter((n) => n.side === 'same')).toHaveLength(2);
		expect(g.centreHidden.same).toBe(2);
	});

	it('handles BC years and leaves year-0 (unknown) games out', () => {
		const d = input([{ a: 0, y: 1990 }, { a: 0.1, y: -2200 }, { a: 0.05, y: 0 }]);
		const g = buildGenealogy(d, 0, opts());
		expect(at(g, 1)).toMatchObject({ side: 'up' });
		expect(at(g, 2)).toBeUndefined();
	});

	it('reports a centre with no year or no vector as unplaceable, with no tree', () => {
		const undated = buildGenealogy(input([{ a: 0, y: 0 }, { a: 0.1, y: 2000 }]), 0, opts());
		expect(undated.placeable).toBe(false);
		expect(undated.nodes).toHaveLength(1);
		const novec = buildGenealogy(input([{ a: 0, y: 2000, has: false }, { a: 0.1, y: 1999 }]), 0, opts());
		expect(novec.placeable).toBe(false);
	});

	it('ignores unfolded / expanded ids that are not in the tree', () => {
		const d = input([{ a: 0, y: 2013 }, { a: 0.1, y: 2007 }, { a: 2, y: 2001 }]);
		const plain = buildGenealogy(d, 0, opts());
		const stale = buildGenealogy(d, 0, opts({ unfolded: new Set([2, 99]), expanded: new Set([expandKey(2, 'up')]) }));
		expect(stale).toEqual(plain);
	});
});

describe('linkKind', () => {
	it('reimplementation beats family beats influence, and reads the link from either end', () => {
		const d = input([
			{ a: 0, y: 2000, rel: [101], fam: [9] },
			{ a: 0, y: 2001, fam: [9] },
			{ a: 0, y: 2002, fam: [9] },
			{ a: 0, y: 2003 }
		]);
		expect(linkKind(d, 0, 1)).toBe('related');
		expect(linkKind(d, 1, 0)).toBe('related'); // only game 0 lists the link
		expect(linkKind(d, 1, 2)).toBe('family');
		expect(linkKind(d, 2, 3)).toBe('influence');
	});
});

describe('linked', () => {
	it('returns every placeable game at or above the threshold, best first, memoised', () => {
		const cache = new Map<number, Link[]>();
		const d = { ...input([{ a: 0, y: 2013 }, { a: 0.2, y: 2001 }, { a: 0.1, y: 2002 }, { a: 1, y: 2003 }]), cache };
		const first = linked(d, 0, 0.9);
		expect(first.map((l) => l.i)).toEqual([2, 1]);
		expect(linked(d, 0, 0.9)).toBe(first);
	});
});
