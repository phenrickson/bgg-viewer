/**
 * Load everything the map page needs: the coordinates artifact and the catalog facts
 * aligned to it. The catalog must already be initialised (`initCatalog()`) — the page
 * awaits that first, since the facts query runs against the in-browser `catalog` table.
 */
import { queryColumns, nameOf } from '$lib/catalog/catalog.svelte';
import { fetchCoordinates, type CoordinateSet } from './coordinates';
import { alignFacts, factsSql, FACT_COLUMNS, type FactRowColumns, type GameFacts } from './facts';
import { CATEGORY_LABELS } from '$lib/catalog/primary-category';

/**
 * The facts, memoised against the coordinate set they are aligned to.
 *
 * `fetchCoordinates` already memoises the artifact, so returning to the map costs no fetch
 * and no reparse — but this ran fresh on every mount: a 36k-row query plus an alignment pass
 * for a result that cannot have changed. The page gates its loader on `facts` being present,
 * so the redundant work also showed "Loading coordinates…" at someone whose coordinates were
 * already in memory.
 *
 * Keyed on the `CoordinateSet` itself (a `WeakMap`, so a replaced artifact is collectable
 * rather than pinned): a new artifact — including the one a sign-out/sign-in produces via
 * `_resetCoordinates` — is a different object and gets its own facts. The promise is cached
 * rather than the value, so two callers racing on mount share one query.
 */
const factsFor = new WeakMap<CoordinateSet, Promise<GameFacts>>();

/** Query the in-browser catalog and align it to `coords`. Requires `catalog.status === 'ready'`. */
export function loadFacts(coords: CoordinateSet): Promise<GameFacts> {
	const hit = factsFor.get(coords);
	if (hit) return hit;
	const pending = (async () => {
		const cols = (await queryColumns(factsSql(), FACT_COLUMNS)) as unknown as FactRowColumns;
		return alignFacts(coords, cols, CATEGORY_LABELS, new Date().getFullYear(), (id) => nameOf(id) ?? `#${id}`);
	})().catch((e) => {
		// Same posture as `fetchCoordinates`: a failure must not be memoised, or one bad query
		// poisons the map for the rest of the session.
		factsFor.delete(coords);
		throw e;
	});
	factsFor.set(coords, pending);
	return pending;
}

/** Test seam: drop the memo so the next call re-queries. */
export function _resetFacts(coords: CoordinateSet): void {
	factsFor.delete(coords);
}

export async function loadMap(): Promise<{ coords: CoordinateSet; facts: GameFacts }> {
	const coords = await fetchCoordinates();
	const facts = await loadFacts(coords);
	return { coords, facts };
}
