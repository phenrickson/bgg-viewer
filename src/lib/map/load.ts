/**
 * Load everything the map page needs: the coordinates artifact and the catalog facts
 * aligned to it. The catalog must already be initialised (`initCatalog()`) — the page
 * awaits that first, since the facts query runs against the in-browser `catalog` table.
 */
import { queryColumns, nameOf } from '$lib/catalog/catalog.svelte';
import { fetchCoordinates, type CoordinateSet } from './coordinates';
import { alignFacts, factsSql, FACT_COLUMNS, type FactRowColumns, type GameFacts } from './facts';
import { CATEGORY_LABELS } from '$lib/catalog/primary-category';

/** Query the in-browser catalog and align it to `coords`. Requires `catalog.status === 'ready'`. */
export async function loadFacts(coords: CoordinateSet): Promise<GameFacts> {
	const cols = (await queryColumns(factsSql(), FACT_COLUMNS)) as unknown as FactRowColumns;
	return alignFacts(coords, cols, CATEGORY_LABELS, new Date().getFullYear(), (id) => nameOf(id) ?? `#${id}`);
}

export async function loadMap(): Promise<{ coords: CoordinateSet; facts: GameFacts }> {
	const coords = await fetchCoordinates();
	const facts = await loadFacts(coords);
	return { coords, facts };
}
