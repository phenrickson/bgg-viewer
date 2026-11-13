import { describe, it, expect, vi } from 'vitest';
import { readLibrary, buildSnapshot, SNAPSHOT_NAME, type Snapshot } from './library';
import type { JsonStore } from './store';
import type { TteRow } from './group';

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

const snapshot: Snapshot = {
	builtAt: '2026-11-19T06:00:00.000Z',
	games: [{ bgg_id: 1, name: 'Old', copies: 1, play_to_win: false }],
	dropped: { outOfCirculation: 0, notStandalone: 0, noBggId: 0 }
};

function memStore(seed: Record<string, unknown> = {}): JsonStore {
	const files = new Map(Object.entries(seed));
	return {
		read: vi.fn(async (name: string) => (files.has(name) ? structuredClone(files.get(name)) : null)) as JsonStore['read'],
		write: vi.fn(async () => {
			throw new Error('the app never writes the library');
		})
	};
}

describe('readLibrary', () => {
	// The universe is built by a daily job, not on a page load: reading it is all the app does.
	it('returns the snapshot from the bucket, whatever its age', async () => {
		const store = memStore({ [SNAPSHOT_NAME]: snapshot });
		expect(await readLibrary(store)).toEqual(snapshot);
		expect(store.write).not.toHaveBeenCalled();
	});

	it('throws a clear error when the job has not built one yet', async () => {
		await expect(readLibrary(memStore())).rejects.toThrow(/not built yet/);
	});
});

describe('buildSnapshot', () => {
	it('groups the rows and stamps the build time', () => {
		const snap = buildSnapshot([row, { ...row, id: 'c2' }], () => NOW);
		expect(snap.builtAt).toBe('2026-11-20T12:00:00.000Z');
		expect(snap.games).toEqual([{ bgg_id: 13, name: 'Catan', copies: 2, play_to_win: false }]);
	});
});
