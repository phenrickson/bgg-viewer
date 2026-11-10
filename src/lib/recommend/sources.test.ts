import { describe, expect, it } from 'vitest';
import { surpriseFrom, drawFrom, withoutIds, type Hit, type Lists } from './sources';

const hits = (...ids: number[]): Hit[] => ids.map((id, i) => ({ id, similarity: 1 - i / 100 }));
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const ids = (h: Hit[]) => h.map((x) => x.id);

describe('surpriseFrom', () => {
	it('draws from Dark horses, falling back when it is empty', () => {
		expect(ids(surpriseFrom({ similar: hits(1), recommender: hits(2), sicko: hits(3) }))).toEqual([3]);
		expect(ids(surpriseFrom({ similar: hits(1), recommender: hits(2), sicko: [] }))).toEqual([2]);
		expect(ids(surpriseFrom({ similar: hits(1), recommender: [], sicko: [] }))).toEqual([1]);
	});
});

describe('withoutIds', () => {
	it('removes ids from every style', () => {
		const lists: Lists = { similar: hits(1, 2), recommender: hits(1, 2, 3), sicko: hits(2) };
		expect(withoutIds(lists, new Set([1, 2]))).toEqual({ similar: [], recommender: [hits(1, 2, 3)[2]], sicko: [] });
	});
});

describe('drawFrom', () => {
	const list = hits(...range(4));
	const seq = (...xs: number[]) => {
		let i = 0;
		return () => xs[i++ % xs.length];
	};

	it('never repeats until the list is used up', () => {
		let seen = new Set<number>();
		const drawn: number[] = [];
		const random = seq(0, 0, 0, 0);
		for (let i = 0; i < 4; i++) {
			const r = drawFrom(list, seen, random);
			drawn.push(r.hit!.id);
			seen = r.seen;
		}
		expect([...drawn].sort()).toEqual(range(4));
	});

	it('starts over once every hit is seen, without repeating the last one', () => {
		const r = drawFrom(list, new Set([1, 2, 3, 4]), seq(0));
		expect(r.hit!.id).not.toBe(4);
		expect([...r.seen]).toEqual([r.hit!.id]);
	});

	it('returns nothing from an empty list', () => {
		expect(drawFrom([], new Set()).hit).toBeNull();
	});
});
