/**
 * Browser side of the BGG.CON library: load the library into the catalog's DuckDB once, and
 * refresh the checked-out counts on demand. Thin glue over `/api/bggcon/*` and
 * `catalog.svelte.ts`; the SQL lives in `catalog/set-filters.ts` (tested).
 */
import { loadConLibrary, setConCheckedOut, catalog } from '$lib/catalog/catalog.svelte';

export interface LibraryGame {
	bgg_id: number;
	name: string;
	copies: number;
	play_to_win: boolean;
}

let games: LibraryGame[] = [];
let builtAt: string | null = null;
let loading: Promise<void> | null = null;

/** The library's games, as last loaded (names come from here for games the catalog lacks). */
export const library = {
	get games() {
		return games;
	},
	get builtAt() {
		return builtAt;
	}
};

/** Fetch the library and load it into DuckDB, once per session. Needs the catalog ready. */
export function ensureConLibrary(): Promise<void> {
	if (catalog.libraryLoaded) return Promise.resolve();
	return (loading ??= (async () => {
		const res = await fetch('/api/bggcon/library');
		if (!res.ok) throw new Error(`library request failed (${res.status})`);
		const data = (await res.json()) as { builtAt: string; games: LibraryGame[] };
		games = data.games;
		builtAt = data.builtAt;
		await loadConLibrary(games);
	})().finally(() => {
		loading = null;
	}));
}

export interface AvailabilityStamp {
	/** Null before the recorder has written anything. */
	asOf: string | null;
	stale: boolean;
	/** Whether checkouts since the con opened are counted: the recorder counts them, live mode can't. */
	hasCheckouts: boolean;
}

/** Refresh the checked-out counts and checkouts for the whole library. */
export async function refreshAvailability(): Promise<AvailabilityStamp> {
	const res = await fetch('/api/bggcon/availability');
	if (!res.ok) throw new Error(`availability request failed (${res.status})`);
	const data = (await res.json()) as {
		as_of: string | null;
		stale: boolean;
		checked_out: Record<number, number>;
		checkouts: Record<number, number> | null;
	};
	await setConCheckedOut(data.checked_out, data.checkouts ?? {});
	return { asOf: data.as_of, stale: data.stale, hasCheckouts: data.checkouts !== null };
}
