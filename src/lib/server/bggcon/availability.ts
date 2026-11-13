/**
 * Where the dashboard's availability comes from (spec §8), and its one response shape.
 *
 * - **Until the recorder starts** (Tue 17 Nov 00:00 Chicago): `live`, the server asks
 *   Tabletop.Events itself, at most once a minute (`checked-out.ts`).
 * - **From then:** `recorder`, the server reads the recorder's `bggcon/checked_out.json`
 *   (bgg-data-warehouse) and never calls Tabletop.Events. One caller, however many viewers.
 *   If the recorder stops, the file's `as_of` stops moving and the response says `stale`; the
 *   server does NOT fall back to asking Tabletop.Events itself.
 * - **The page's Auto / Live / Recorder choice** (`?source=` on the endpoint) overrides the
 *   date, so a viewer can see either feed. Live is still one shared fetch a minute per instance,
 *   so the worst case during the con is two requests a minute. Live has no con checkouts.
 */
import type { TtlResult } from './ttl-value';

export type Source = 'live' | 'recorder';

/** Tue 17 Nov 2026 00:00, America/Chicago (CST, UTC−6): the recorder's first run. */
export const RECORDER_START = new Date('2026-11-17T06:00:00Z');
/** The recorder writes every minute; a few missed minutes mean it has stopped. */
export const STALE_AFTER_MS = 3 * 60_000;
export const RECORDER_FILE = 'bggcon/checked_out.json';

export interface RecorderFile {
	as_of: string;
	checked_out: Record<string, number>;
	/** Checkouts per game since the con opened (absent before the recorder counted them). */
	checkouts?: Record<string, number>;
}

export interface Availability {
	as_of: string | null;
	stale: boolean;
	source: Source;
	/** BGG id → copies out now. A game with nothing out is absent. */
	checked_out: Record<number, number>;
	/** BGG id → checkouts since the con opened; null in live mode, where there's no such count. */
	checkouts: Record<number, number> | null;
}

/** `?source=`: `live` or `recorder`; anything else means auto (follow the date). */
export function parseSource(param: string | null): Source | undefined {
	return param === 'live' || param === 'recorder' ? param : undefined;
}

export function chooseSource(now: Date, setting?: string): Source {
	if (setting === 'live' || setting === 'recorder') return setting;
	return now >= RECORDER_START ? 'recorder' : 'live';
}

const byId = (m: Record<string, number> | undefined): Record<number, number> =>
	Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [Number(k), v]));

export function fromRecorder(file: RecorderFile | null, now: Date): Availability {
	if (!file) return { as_of: null, stale: true, source: 'recorder', checked_out: {}, checkouts: {} };
	const at = Date.parse(file.as_of);
	return {
		as_of: new Date(at).toISOString(),
		stale: now.getTime() - at > STALE_AFTER_MS,
		source: 'recorder',
		checked_out: byId(file.checked_out),
		checkouts: byId(file.checkouts)
	};
}

export function fromLive(out: TtlResult<Record<number, number>>): Availability {
	return {
		as_of: new Date(out.at).toISOString(),
		stale: out.stale,
		source: 'live',
		checked_out: out.value,
		checkouts: null
	};
}
