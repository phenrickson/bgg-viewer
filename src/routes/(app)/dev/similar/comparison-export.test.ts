import { describe, it, expect } from 'vitest';
import { buildComparisonHtml, comparisonId, type ComparisonSpec } from './comparison-export';

const spec: ComparisonSpec = {
	experiments: ['baseline', 'tuned', 'sicko'],
	games: [
		{
			id: 13,
			name: 'Catan',
			year: 1995,
			lists: [
				[{ id: 1, name: 'Shared', year: 2000 }, { id: 2, name: 'OnlyBaseline', year: 2001 }],
				[{ id: 1, name: 'Shared', year: 2000 }, { id: 3, name: 'OnlyTuned', year: 2002 }],
				[{ id: 1, name: 'Shared', year: 2000 }, { id: 4, name: 'OnlySicko </script>', year: 2003 }]
			]
		},
		{
			id: 30549,
			name: 'Pandemic',
			year: 2008,
			// identical across all three → an "unchanged" row
			lists: [
				[{ id: 5, name: 'A', year: null }],
				[{ id: 5, name: 'A', year: null }],
				[{ id: 5, name: 'A', year: null }]
			]
		}
	]
};

describe('buildComparisonHtml', () => {
	const html = buildComparisonHtml(spec, new Date('2026-09-03T00:00:00Z'));

	it('is a self-contained document with the real experiment names as headers', () => {
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).not.toContain('src=');
		expect(html).toContain('<b>baseline</b>');
		expect(html).toContain('<b>tuned</b>');
		expect(html).toContain('<b>sicko</b>');
	});

	it('escapes markup in game names so a list entry cannot break out', () => {
		expect(html).not.toContain('OnlySicko </script>');
		expect(html).toContain('OnlySicko &lt;/script&gt;');
	});

	it('marks entries unique to one column and leaves shared ones plain', () => {
		// "Shared" appears in all three lists → never gets the unique class
		expect(html).not.toMatch(/<li class="u"><a[^>]*>Shared/);
		// the column-only entries do
		expect(html).toMatch(/<li class="u"><a[^>]*>OnlyBaseline/);
		expect(html).toMatch(/<li class="u"><a[^>]*>OnlyTuned/);
	});

	it('links every list entry to its BGG page', () => {
		expect(html).toContain('<a href="https://boardgamegeek.com/boardgame/2" target="_blank"');
		expect(html).toMatch(/<li><a href="https:\/\/boardgamegeek\.com\/boardgame\/1"[^>]*>Shared<\/a>/);
	});

	it('reports how many lists differ and flags the unchanged row', () => {
		expect(html).toContain('1 of 2 lists differ');
		expect(html).toContain('generated 2026-09-03');
		// the Pandemic row (identical everywhere) is class "same"
		expect(html).toMatch(/class="row same"/);
	});

	it('lays the grid out for exactly N experiments', () => {
		expect(html).toContain('grid-template-columns: 12rem repeat(3, minmax(0, 1fr))');
	});

	it('works for a two-way comparison too', () => {
		const two = buildComparisonHtml({ ...spec, experiments: ['a', 'b'], games: spec.games.map((g) => ({ ...g, lists: g.lists.slice(0, 2) })) });
		expect(two).toContain('repeat(2, minmax(0, 1fr))');
		expect(two).toContain('<b>a</b>');
	});
});

describe('comparisonId', () => {
	it('is a stable 7-char slug, sensitive to the experiments and the panel', () => {
		expect(comparisonId(spec)).toBe(comparisonId(spec));
		expect(comparisonId(spec)).toMatch(/^[a-z0-9]{7}$/);
		expect(comparisonId({ ...spec, experiments: ['x', 'y', 'z'] })).not.toBe(comparisonId(spec));
	});
});
