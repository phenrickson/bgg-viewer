import { describe, it, expect } from 'vitest';
import {
	CATEGORIES,
	CATEGORY_PRIORITY,
	CATEGORY_LABELS,
	CATEGORY_SLOTS,
	categoryToken,
	primaryCategorySql
} from './primary-category';

describe('the curated category list', () => {
	it('fits the palette', () => {
		expect(CATEGORIES.length).toBeLessThanOrEqual(CATEGORY_SLOTS);
	});

	it('has the same members as the priority order, only reordered', () => {
		expect([...CATEGORY_PRIORITY].sort()).toEqual([...CATEGORIES].sort());
	});

	it('labels code 0 as Other and 1..n as the slot order', () => {
		expect(CATEGORY_LABELS[0]).toBe('Other');
		expect(CATEGORY_LABELS.slice(1)).toEqual(CATEGORIES);
	});
});

describe('categoryToken', () => {
	it('maps a code to its palette slot', () => {
		expect(categoryToken(1)).toBe('var(--map-cat-1)');
		expect(categoryToken(CATEGORY_SLOTS)).toBe(`var(--map-cat-${CATEGORY_SLOTS})`);
	});

	it('falls back to the faint "other" token outside 1..slots', () => {
		expect(categoryToken(0)).toBe('var(--map-cat-other)');
		expect(categoryToken(CATEGORY_SLOTS + 1)).toBe('var(--map-cat-other)');
		expect(categoryToken(-1)).toBe('var(--map-cat-other)');
	});
});

describe('primaryCategorySql', () => {
	const sql = primaryCategorySql();

	it('codes each label by its COLOUR slot, not its priority position', () => {
		// Wargame is 2nd by priority but 3rd by colour slot — the code must be the slot.
		expect(CATEGORY_PRIORITY.indexOf('Wargame')).toBe(1);
		expect(CATEGORIES.indexOf('Wargame')).toBe(2);
		expect(sql).toContain("WHEN list_contains(categories, 'Wargame') THEN 3");
	});

	it('tests in PRIORITY order, so the more specific tag wins', () => {
		// An 18xx game carries both Trains and Economic; Trains must be tested first.
		expect(sql.indexOf("'Trains'")).toBeLessThan(sql.indexOf("'Economic'"));
		// A wargame with an economy is a wargame.
		expect(sql.indexOf("'Wargame'")).toBeLessThan(sql.indexOf("'Economic'"));
		// Card Game is a format tag and only claims what nothing else did.
		const last = CATEGORY_PRIORITY[CATEGORY_PRIORITY.length - 1];
		expect(last).toBe('Card Game');
		for (const other of CATEGORY_PRIORITY.slice(0, -1)) {
			expect(sql.indexOf(`'${other.replace(/'/g, "''")}'`)).toBeLessThan(sql.indexOf("'Card Game'"));
		}
	});

	it('falls through to 0 (Other)', () => {
		expect(sql).toContain('ELSE 0 END');
	});

	it("escapes quotes in a label — Children's Game would otherwise break the string", () => {
		expect(sql).toContain("'Children''s Game'");
		// And never leaves a bare unescaped apostrophe mid-literal.
		expect(sql).not.toMatch(/'Children's Game'/);
	});

	it('is a bare expression, so a caller can select it beside anything else', () => {
		expect(sql.startsWith('CASE ')).toBe(true);
		expect(sql).not.toMatch(/\bSELECT\b/i);
	});

	it('ignores a priority entry that names no colour slot', () => {
		const partial = primaryCategorySql(['Trains'], ['Wargame', 'Trains']);
		expect(partial).toContain("WHEN list_contains(categories, 'Trains') THEN 1");
		expect(partial).not.toContain('Wargame');
	});

	it('degrades to a constant when there are no labels at all', () => {
		expect(primaryCategorySql([], [])).toBe('0');
	});

	it('never codes past the palette, even given a longer list', () => {
		const tooMany = Array.from({ length: CATEGORY_SLOTS + 3 }, (_, i) => `Cat${i + 1}`);
		const over = primaryCategorySql(tooMany, tooMany);
		expect(over).toContain(`THEN ${CATEGORY_SLOTS}`);
		expect(over).not.toContain(`THEN ${CATEGORY_SLOTS + 1}`);
		expect(over).not.toContain(`'Cat${CATEGORY_SLOTS + 1}'`);
	});
});
