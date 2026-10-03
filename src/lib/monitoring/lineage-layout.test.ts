import { describe, expect, it } from 'vitest';
import { layoutLineage } from './lineage-layout';

const n = (id: string, dataset = 'analytics') => ({ id, dataset, name: id });

describe('layoutLineage', () => {
	it('puts each node one column right of its deepest input', () => {
		const out = layoutLineage([n('a', 'raw'), n('b'), n('c')], [['a', 'b'], ['b', 'c'], ['a', 'c']]);
		expect(out.placements.get('a')!.column).toBe(0);
		expect(out.placements.get('b')!.column).toBe(1);
		expect(out.placements.get('c')!.column).toBe(2);
		expect(out.columns).toBe(3);
		expect(out.upstream.get('c')).toEqual(['b', 'a']);
		expect(out.downstream.get('a')).toEqual(['b', 'c']);
	});

	it('orders a column by dataset, then name', () => {
		const out = layoutLineage([n('z', 'analytics'), n('y', 'raw'), n('x', 'analytics')], []);
		const row = (id: string) => out.placements.get(id)!.row;
		expect([row('y'), row('x'), row('z')]).toEqual([0, 1, 2]);
		expect(out.rows).toBe(3);
	});

	it('places nodes in a cycle after everything else, and ignores edges to unknown nodes', () => {
		const out = layoutLineage([n('a'), n('x'), n('y')], [['a', 'x'], ['x', 'y'], ['y', 'x'], ['a', 'ghost']]);
		expect(out.placements.get('a')!.column).toBe(0);
		expect(out.placements.get('x')!.column).toBe(1);
		expect(out.placements.get('y')!.column).toBe(1);
		expect(out.placements.size).toBe(3);
	});
});
