import { describe, it, expect, vi } from 'vitest';
import { fetchLibrary, fetchCheckedOut, LIBRARY_URL } from './tte';

/** Two real rows (trimmed), 2026-11-12. */
const ROWS = [
	{
		id: '00006FF8-B2CE-11F1-A13A-DF81FC8507AB',
		bgg_id: 470815,
		name: 'Sumidagawa Red Town (Japanese edition)',
		is_checked_out: 0,
		is_in_circulation: 1,
		is_play_to_win: 0,
		custom_fields: { ItemType: 'Standalone', Location: 'NEW' }
	},
	{
		id: '0014E2C8-4265-11EC-A1D8-4B55DA2BA7C0',
		bgg_id: 146035,
		name: 'Eggs of Ostrich',
		is_checked_out: 0,
		is_in_circulation: 1,
		is_play_to_win: 0,
		custom_fields: { ItemType: 'Standalone', BGGRank: '5496', Location: 'CARD RACK' }
	}
];

/** A fake API: `pages[i]` is page i+1's items, in Tabletop.Events' response shape. */
function fakeApi(pages: unknown[][]) {
	return vi.fn(async (url: string) => {
		const page = Number(new URL(url).searchParams.get('_page_number'));
		return new Response(
			JSON.stringify({
				result: {
					items: pages[page - 1] ?? [],
					paging: { total_pages: pages.length, page_number: String(page), items_per_page: '100' }
				}
			}),
			{ headers: { 'content-type': 'application/json' } }
		);
	});
}

const noPause = async () => {};

describe('fetchLibrary', () => {
	it('reads every page, 100 at a time, and returns all rows', async () => {
		const f = fakeApi([[ROWS[0]], [ROWS[1]]]);
		const rows = await fetchLibrary(f, noPause);
		expect(rows.map((r) => r.bgg_id)).toEqual([470815, 146035]);
		expect(f).toHaveBeenCalledTimes(2);
		const first = new URL(f.mock.calls[0][0]);
		expect(first.origin + first.pathname).toBe(LIBRARY_URL);
		// 100 is the API's cap; above it, it silently drops to 25.
		expect(first.searchParams.get('_items_per_page')).toBe('100');
	});

	// Politeness: one request at a time, with a pause between pages.
	it('fetches pages one after another, pausing between them', async () => {
		const order: string[] = [];
		const f = fakeApi([[ROWS[0]], [ROWS[1]], []]);
		const pause = vi.fn(async () => {
			order.push('pause');
		});
		f.mockImplementationOnce(async (url: string) => {
			order.push('p1');
			return fakeApi([[ROWS[0]], [ROWS[1]], []])(url);
		});
		await fetchLibrary(f, pause);
		expect(pause).toHaveBeenCalledTimes(2);
		expect(order.slice(0, 2)).toEqual(['p1', 'pause']);
	});

	it('throws on a non-OK response rather than returning a partial library', async () => {
		const f = vi.fn(async () => new Response('nope', { status: 503 }));
		await expect(fetchLibrary(f, noPause)).rejects.toThrow(/503/);
	});
});

describe('fetchCheckedOut', () => {
	it('asks the API for checked-out copies only, and returns those rows', async () => {
		const f = fakeApi([[{ ...ROWS[0], is_checked_out: 1 }]]);
		const rows = await fetchCheckedOut(f, noPause);
		expect(rows.map((r) => r.bgg_id)).toEqual([470815]);
		expect(new URL(f.mock.calls[0][0]).searchParams.get('is_checked_out')).toBe('1');
	});
});
