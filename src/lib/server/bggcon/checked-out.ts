/**
 * Ids of the copies checked out right now, fetched from Tabletop.Events at most once a minute
 * per instance, however many tabs are polling. Raise TTL_MS (one constant) if the checked-out
 * set gets large at peak.
 */
import { fetchCheckedOut } from './tte';
import { createTtlValue } from './ttl-value';

const TTL_MS = 60_000;

const cached = createTtlValue({ ttlMs: TTL_MS, load: () => fetchCheckedOut() });

export const getCheckedOut = () => cached.get();
