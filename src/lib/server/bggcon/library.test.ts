import { describe, it, expect, vi } from 'vitest';
import { loadLibrary, SNAPSHOT_NAME, type Snapshot } from './library';
import type { JsonStore } from './store';
import type { TteRow } from './group';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-20T12:00:00Z');

const row: TteRow = {
	id: 'c1',
	bgg_id: 13,
	name: 'Catan',
	is_checked_out: 0,
	is_in_circulation: 1,
	is_play_to_win: 0,
	custom_fields: { ItemType: 'Standalone' }
};

const snapshot = (ageHours: number): Snapshot => ({
	builtAt: new Date(NOW - ageHours * HOUR).toISOString(),
	games: [{ bgg_id: 1, name: 'Old', copies: 1, play_to_win: false, copy_ids: ['o'] }],
	dropped: { outOfCirculation: 0, notStandalone: 0, noBggId: 0 }
});

function memStore(seed: Record<string, unknown> = {}) {
	const files = new Map(Object.entries(seed));
	const store: JsonStore = {
		read: vi.fn(async (name: string) => (files.has(name) ? structuredClone(files.get(name)) : null)) as JsonStore['read'],
		write: vi.fn(async (name: string, value: unknown) => void files.set(name, value))
	};
	return { store, files };
}

const clock = () => NOW;

describe('loadLibrary', () => {
	// A cold instance must not cost Tabletop.Events 86 requests when a recent snapshot exists.
	it('uses a snapshot younger than 6 h without calling Tabletop.Events', async () => {
		const { store } = memStore({ [SNAPSHOT_NAME]: snapshot(5) });
		const fetchRows = vi.fn(async () => [row]);
		const lib = await loadLibrary({ store, fetchRows, clock });
		expect(lib.games[0].name).toBe('Old');
		expect(fetchRows).not.toHaveBeenCalled();
	});

	it('rebuilds a snapshot older than 6 h, and saves it', async () => {
		const { store, files } = memStore({ [SNAPSHOT_NAME]: snapshot(7) });
		const lib = await loadLibrary({ store, fetchRows: async () => [row], clock });
		expect(lib.games.map((g) => g.name)).toEqual(['Catan']);
		expect(lib.builtAt).toBe(new Date(NOW).toISOString());
		expect((files.get(SNAPSHOT_NAME) as Snapshot).games[0].name).toBe('Catan');
	});

	it('builds and saves one when there is no snapshot yet', async () => {
		const { store, files } = memStore();
		await loadLibrary({ store, fetchRows: async () => [row], clock });
		expect(files.has(SNAPSHOT_NAME)).toBe(true);
	});

	it('falls back to an old snapshot when Tabletop.Events fails', async () => {
		const { store } = memStore({ [SNAPSHOT_NAME]: snapshot(30) });
		const lib = await loadLibrary({ store, fetchRows: async () => Promise.reject(new Error('down')), clock });
		expect(lib.games[0].name).toBe('Old');
	});

	it('throws when Tabletop.Events fails and there is no snapshot', async () => {
		const { store } = memStore();
		await expect(
			loadLibrary({ store, fetchRows: async () => Promise.reject(new Error('down')), clock })
		).rejects.toThrow('down');
	});

	// The fresh library is in hand; a bucket hiccup on the save shouldn't throw it away.
	it('still returns the rebuilt library when saving it fails', async () => {
		const { store } = memStore();
		store.write = vi.fn(async () => Promise.reject(new Error('403')));
		const lib = await loadLibrary({ store, fetchRows: async () => [row], clock });
		expect(lib.games).toHaveLength(1);
	});
});
