/**
 * Tabletop.Events reads for the BGG.CON library. Public API, no key or login (checked
 * 2026-11-12).
 *
 * Politeness is the design constraint: pages are fetched one at a time with a pause between
 * them, never in parallel. The library pull runs in the daily job
 * (`scripts/build-bggcon-library.ts`); the checked-out read at most once a minute.
 */
import type { TteRow } from './group';

/** The standing "bgg-events" library that the BGG.CON 2026 page shows. */
export const LIBRARY_URL =
	'https://tabletop.events/api/library/0AEB11DA-2B7D-11EC-B400-855F800FD618/librarygames';

/** The API's cap. Ask for more and it silently drops to 25 per page. */
const PER_PAGE = 100;
const PAUSE_MS = 300;
const TIMEOUT_MS = 20_000;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Pause = () => Promise<void>;

const realPause: Pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

interface Page {
	items: TteRow[];
	paging: { total_pages: number };
}

async function allPages(params: Record<string, string>, f: Fetch, pause: Pause): Promise<TteRow[]> {
	const rows: TteRow[] = [];
	let total = 1;
	for (let page = 1; page <= total; page++) {
		if (page > 1) await pause();
		const url = new URL(LIBRARY_URL);
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		url.searchParams.set('_items_per_page', String(PER_PAGE));
		url.searchParams.set('_page_number', String(page));

		const res = await f(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
		// A partial library would look complete and hide games, so any failure fails the whole read.
		if (!res.ok) throw new Error(`Tabletop.Events page ${page} failed (${res.status})`);
		const { result } = (await res.json()) as { result: Page };
		rows.push(...result.items);
		total = Number(result.paging.total_pages) || 1;
	}
	return rows;
}

/** Every copy in the library (about 86 requests). */
export const fetchLibrary = (f: Fetch = fetch, pause: Pause = realPause): Promise<TteRow[]> =>
	allPages({}, f, pause);

/** The copies checked out right now. The API filters, so this is a page or a few. */
export const fetchCheckedOut = (f: Fetch = fetch, pause: Pause = realPause): Promise<TteRow[]> =>
	allPages({ is_checked_out: '1' }, f, pause);
