/**
 * The con library as games: a snapshot in the bucket, rebuilt from Tabletop.Events when it's
 * older than 6 h. A full pull is about 86 requests, so a cold instance reads the snapshot
 * rather than pulling again; and when Tabletop.Events fails, an old snapshot beats none.
 */
import { groupLibrary, type Grouped, type TteRow } from './group';
import { fetchLibrary } from './tte';
import { gcsStore, type JsonStore } from './store';
import { createTtlValue } from './ttl-value';

export const SNAPSHOT_NAME = 'bggcon/library.json';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** How often an instance re-checks the bucket. Cheap: one small read. */
const MEMORY_TTL_MS = 30 * 60 * 1000;

export interface Snapshot extends Grouped {
	builtAt: string;
}

export interface LoadLibraryDeps {
	store: JsonStore;
	fetchRows: () => Promise<TteRow[]>;
	clock: () => number;
}

export async function loadLibrary({ store, fetchRows, clock }: LoadLibraryDeps): Promise<Snapshot> {
	const saved = await store.read<Snapshot>(SNAPSHOT_NAME).catch((e) => {
		console.error('[bggcon] snapshot read failed:', e);
		return null;
	});
	if (saved && clock() - Date.parse(saved.builtAt) < MAX_AGE_MS) return saved;

	let rows: TteRow[];
	try {
		rows = await fetchRows();
	} catch (e) {
		if (saved) {
			console.error('[bggcon] library pull failed, using the snapshot from', saved.builtAt, e);
			return saved;
		}
		throw e;
	}

	const snap: Snapshot = { builtAt: new Date(clock()).toISOString(), ...groupLibrary(rows) };
	console.log(
		`[bggcon] library rebuilt: ${snap.games.length} games from ${rows.length} copies; dropped`,
		snap.dropped
	);
	await store.write(SNAPSHOT_NAME, snap).catch((e) => console.error('[bggcon] snapshot save failed:', e));
	return snap;
}

const cached = createTtlValue({
	ttlMs: MEMORY_TTL_MS,
	load: () => loadLibrary({ store: gcsStore, fetchRows: () => fetchLibrary(), clock: Date.now })
});

/** The library, from memory, the bucket or Tabletop.Events, in that order. */
export const getLibrary = () => cached.get().then((r) => r.value);
