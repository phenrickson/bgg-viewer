/**
 * The universe: the con library as games and copy counts, in `bggcon/library.json`.
 *
 * Built once a day by a GitHub Action (`scripts/build-bggcon-library.ts`), never on a page
 * load: a full pull is about 86 requests and ~2 minutes, and the library barely changes (no
 * copies added in the 30 days before 2026-11-12; it grows in batches before events). The app
 * only reads it. Availability is separate (`checked-out.ts`) and doesn't depend on this.
 */
import { groupLibrary, type Grouped, type TteRow } from './group';
import { gcsStore, type JsonStore } from './store';
import { createTtlValue } from './ttl-value';

export const SNAPSHOT_NAME = 'bggcon/library.json';
/** How often an instance re-reads the snapshot. Cheap: one small read. */
const MEMORY_TTL_MS = 30 * 60 * 1000;

export interface Snapshot extends Grouped {
	builtAt: string;
}

/** Group a full pull into a snapshot. Used by the daily job. */
export function buildSnapshot(rows: TteRow[], clock: () => number = Date.now): Snapshot {
	return { builtAt: new Date(clock()).toISOString(), ...groupLibrary(rows) };
}

export async function readLibrary(store: JsonStore = gcsStore): Promise<Snapshot> {
	const snap = await store.read<Snapshot>(SNAPSHOT_NAME);
	if (!snap) {
		throw new Error(
			`${SNAPSHOT_NAME} not built yet. Run the "bggcon library" workflow (workflow_dispatch).`
		);
	}
	return snap;
}

const cached = createTtlValue({ ttlMs: MEMORY_TTL_MS, load: () => readLibrary() });

export const getLibrary = () => cached.get().then((r) => r.value);
