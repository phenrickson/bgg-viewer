import { describe, expect, it } from 'vitest';
import { sourceFor, sectionsFor, surpriseFrom, withoutIds, tooThin, type Hit, type Lists } from './sources';

const hits = (...ids: number[]): Hit[] => ids.map((id, i) => ({ id, similarity: 1 - i / 100 }));
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const ids = (h: Hit[]) => h.map((x) => x.id);

describe('sourceFor', () => {
	it('routes each pool by what the seed is', () => {
		expect(sourceFor('all', true, false)).toEqual({ kind: 'catalog' });
		expect(sourceFor('unowned', true, false)).toEqual({ kind: 'artifact', part: 'C' });
		expect(sourceFor('unowned', false, true)).toEqual({ kind: 'catalog-minus-owned' });
		expect(sourceFor('shelf', true, false)).toEqual({ kind: 'artifact', part: 'A' });
		expect(sourceFor('shelf', false, true)).toEqual({ kind: 'artifact', part: 'D' });
		expect(sourceFor('shelf', false, false)).toEqual({ kind: 'live', pool: 'collection' });
	});
});

describe('sectionsFor', () => {
	it('stacks Recommended, Most similar, Dark horses in that order', () => {
		const lists: Lists = { kind: 'styles', similar: hits(1), recommender: hits(2), sicko: hits(3) };
		expect(sectionsFor(lists).map((s) => s.key)).toEqual(['recommender', 'similar', 'sicko']);
	});

	it('leaves out an empty section and caps each at 10', () => {
		const lists: Lists = { kind: 'styles', similar: hits(...range(12)), recommender: [], sicko: hits(3) };
		const s = sectionsFor(lists);
		expect(s.map((x) => x.key)).toEqual(['similar', 'sicko']);
		expect(s[0].hits).toHaveLength(10);
	});

	it('gives a shelf list one section', () => {
		const s = sectionsFor({ kind: 'shelf', list: hits(...range(20)) });
		expect(s).toHaveLength(1);
		expect(s[0].key).toBe('shelf');
		expect(ids(s[0].hits)).toEqual(range(10));
	});
});

describe('surpriseFrom', () => {
	it('draws from Dark horses, falling back when it is empty', () => {
		expect(ids(surpriseFrom({ kind: 'styles', similar: hits(1), recommender: hits(2), sicko: hits(3) }))).toEqual([3]);
		expect(ids(surpriseFrom({ kind: 'styles', similar: hits(1), recommender: hits(2), sicko: [] }))).toEqual([2]);
		expect(ids(surpriseFrom({ kind: 'styles', similar: hits(1), recommender: [], sicko: [] }))).toEqual([1]);
	});

	it('draws from ranks 5–20 of a shelf list', () => {
		expect(ids(surpriseFrom({ kind: 'shelf', list: hits(...range(25)) }))).toEqual(range(20).slice(4));
	});
});

describe('withoutIds / tooThin', () => {
	it('removes ids from every style and flags a thin result', () => {
		const lists: Lists = { kind: 'styles', similar: hits(1, 2), recommender: hits(1, 2, 3), sicko: hits(2) };
		const left = withoutIds(lists, new Set([1, 2]));
		expect(left).toEqual({ kind: 'styles', similar: [], recommender: [hits(1, 2, 3)[2]], sicko: [] });
		expect(tooThin(left)).toBe(true);
		expect(tooThin(lists)).toBe(false);
	});
});
