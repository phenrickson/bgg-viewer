/**
 * The library snapshot's shape and how it's built. Pure (no `$env`, no bucket), so the daily
 * job (`scripts/build-bggcon-library.ts`) and the app share it.
 */
import { groupLibrary, type Grouped, type TteRow } from './group';

export const SNAPSHOT_NAME = 'bggcon/library.json';

export interface Snapshot extends Grouped {
	builtAt: string;
}

/** Group a full pull into a snapshot. */
export function buildSnapshot(rows: TteRow[], clock: () => number = Date.now): Snapshot {
	return { builtAt: new Date(clock()).toISOString(), ...groupLibrary(rows) };
}

/** An empty pull fails the job, so yesterday's snapshot stays in place. */
export function assertUsable(snap: Snapshot): void {
	if (snap.games.length === 0) throw new Error('library pull produced no games; refusing to publish');
}
