/**
 * Availability: checked-out copies per BGG id, fetched from Tabletop.Events at most once a
 * minute per instance, however many tabs are polling. Independent of the library snapshot:
 * it needs only the checked-out rows. Raise TTL_MS (one constant) if the checked-out set gets
 * large at peak.
 */
import { checkedOutByGame } from './group';
import { fetchCheckedOut } from './tte';
import { createTtlValue } from './ttl-value';
import { gcsStore } from './store';
import { env } from '$env/dynamic/private';
import {
	chooseSource,
	fromLive,
	fromRecorder,
	RECORDER_FILE,
	type Availability,
	type RecorderFile
} from './availability';

const TTL_MS = 60_000;

const cached = createTtlValue({
	ttlMs: TTL_MS,
	load: async () => checkedOutByGame(await fetchCheckedOut())
});

export const getCheckedOut = () => cached.get();

/**
 * The recorder's `bggcon/checked_out.json`, read at most once a minute per instance however many
 * tabs poll (see `availability.ts`). A failed read serves the last good file.
 */
const recorderFile = createTtlValue({
	ttlMs: TTL_MS,
	load: () => gcsStore.read<RecorderFile>(RECORDER_FILE)
});

/** Availability from the source `chooseSource` picks for now. */
export async function getAvailability(now = new Date(), setting = env.BGGCON_AVAILABILITY): Promise<Availability> {
	return chooseSource(now, setting) === 'recorder'
		? fromRecorder((await recorderFile.get()).value, now)
		: fromLive(await cached.get());
}
