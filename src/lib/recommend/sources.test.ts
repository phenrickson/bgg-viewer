import { describe, expect, it } from 'vitest';
import { sourceFor, listFor, withoutIds, tooThin, type Hit, type Lists } from './sources';

const hits = (...ids: number[]): Hit[] => ids.map((id, i) => ({ id, similarity: 1 - i / 100 }));
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

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

describe('listFor', () => {
	const styles: Lists = { kind: 'styles', similar: hits(1, 2), recommender: hits(3, 4), sicko: hits(5, 6) };

	it('Best match is recommender, Surprise is sicko', () => {
		expect(listFor(styles, 'best').map((h) => h.id)).toEqual([3, 4]);
		expect(listFor(styles, 'surprise').map((h) => h.id)).toEqual([5, 6]);
	});

	it('falls back when a style is empty', () => {
		const thin: Lists = { kind: 'styles', similar: hits(1), recommender: [], sicko: [] };
		expect(listFor(thin, 'best').map((h) => h.id)).toEqual([1]);
		expect(listFor({ ...thin, recommender: hits(3) }, 'surprise').map((h) => h.id)).toEqual([3]);
	});

	it('on a shelf list, Best is ranks 1–10 and Surprise ranks 5–20', () => {
		const shelf: Lists = { kind: 'shelf', list: hits(...range(25)) };
		expect(listFor(shelf, 'best').map((h) => h.id)).toEqual(range(10));
		expect(listFor(shelf, 'surprise').map((h) => h.id)).toEqual(range(20).slice(4));
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
