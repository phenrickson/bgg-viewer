/**
 * Availability: checked-out copies per BGG id, fetched from Tabletop.Events at most once a
 * minute per instance, however many tabs are polling. Independent of the library snapshot:
 * it needs only the checked-out rows. Raise TTL_MS (one constant) if the checked-out set gets
 * large at peak.
 */
import { checkedOutByGame } from './group';
import { fetchCheckedOut } from './tte';
import { createTtlValue } from './ttl-value';

const TTL_MS = 60_000;

const cached = createTtlValue({
	ttlMs: TTL_MS,
	load: async () => checkedOutByGame(await fetchCheckedOut())
});

export const getCheckedOut = () => cached.get();
