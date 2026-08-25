import { describe, it, expect } from 'vitest';
import { dayIndex, pick } from './rotation';

const L3 = ['a', 'b', 'c'] as const;

describe('dayIndex', () => {
	it('is stable across a whole day and advances exactly once at the boundary', () => {
		const day = Date.UTC(2026, 7, 3);
		expect(dayIndex(day)).toBe(dayIndex(day + 86_399_999));
		expect(dayIndex(day + 86_400_000)).toBe(dayIndex(day) + 1);
	});
});

describe('pick', () => {
	it('is deterministic — the same day always starts at the same item', () => {
		const day = 12345;
		expect(pick(L3, day)).toBe(pick(L3, day));
		expect(pick(L3, day, 2)).toBe(pick(L3, day, 2));
	});

	it('wraps at list length, offset from whatever the day starts at', () => {
		const day = 9;
		const start = pick(L3, day);
		expect(pick(L3, day, 3)).toBe(start); // a full lap of a 3-item list returns to start
		expect(pick(L3, day, -3)).toBe(start);
	});

	it('walks a stable, complete cycle as offset increases', () => {
		// Offsets step through the day's own shuffled order — no longer the source order of
		// `list` — so the contract is that one lap visits every item exactly once, in an order
		// that stays put for that day.
		const day = 40;
		const lap = [0, 1, 2].map((o) => pick(L3, day, o));
		expect(new Set(lap).size).toBe(L3.length);
		expect(lap).toEqual([0, 1, 2].map((o) => pick(L3, day, o)));
	});

	it('does not step through the list in its source order', () => {
		// The bug this replaced: the day picked a starting position but the list underneath was
		// still in source (filename-prefix) order, so offset 0,1,2… always walked 01,02,03…
		// and the page's two slots (one step apart) always drew neighbouring entries.
		const list = Array.from({ length: 12 }, (_, i) => i);
		let sourceOrder = 0;
		for (let d = 0; d < 200; d++) {
			const a = pick(list, d, 0) as number;
			const b = pick(list, d, 1) as number;
			if (b === (a + 1) % list.length) sourceOrder++;
		}
		expect(sourceOrder / 200).toBeLessThan(0.3);
	});

	it('gives the two slots on one page unrelated items, not neighbours', () => {
		const list = Array.from({ length: 12 }, (_, i) => i);
		for (let d = 0; d < 50; d++) {
			expect(pick(list, d, 0)).not.toBe(pick(list, d, 1));
		}
	});

	it('handles negative offsets — JS % keeps the dividend sign, so this would go OOB', () => {
		const day = 200;
		const start = pick(L3, day);
		const startIdx = L3.indexOf(start as (typeof L3)[number]);
		expect(pick(L3, day, -1)).toBe(L3[(startIdx - 1 + L3.length) % L3.length]);
	});

	it('returns null for an empty list rather than undefined', () => {
		expect(pick([], 7)).toBeNull();
	});

	it('does not just walk the list in order, one step per day', () => {
		// The old behaviour (`day % length` as the index) always advanced by exactly one
		// position a day — with vizzes ordered by filename prefix, that meant the rotation
		// visited them in that same fixed order forever. A large sample of consecutive days
		// should NOT reproduce that lockstep pattern.
		const list = Array.from({ length: 8 }, (_, i) => i);
		let lockstep = 0;
		let total = 0;
		for (let d = 1; d < 200; d++) {
			const prev = pick(list, d - 1) as number;
			const cur = pick(list, d) as number;
			total++;
			if (cur === (prev + 1) % list.length) lockstep++;
		}
		expect(lockstep / total).toBeLessThan(0.5);
	});

	it('visits most of a list across enough days, rather than favouring a few slots', () => {
		const list = Array.from({ length: 8 }, (_, i) => i);
		const seen = new Set<number>();
		for (let d = 0; d < 500; d++) seen.add(pick(list, d) as number);
		expect(seen.size).toBe(list.length);
	});
});
