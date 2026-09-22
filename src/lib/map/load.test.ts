import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `loadFacts` memoises against the coordinate set, so returning to the map does not re-run a
 * 36k-row query for a result that cannot have changed. These pin the two things that make
 * the memo safe rather than merely fast: a different artifact gets its own facts, and a
 * failure is never cached.
 */
const queryColumns = vi.fn();
const nameOf = vi.fn((id: number) => `Game ${id}`);

vi.mock('$lib/catalog/catalog.svelte', () => ({
	queryColumns: (...a: unknown[]) => queryColumns(...a),
	nameOf: (id: number) => nameOf(id)
}));

const { loadFacts, _resetFacts } = await import('./load');
type CoordinateSet = Parameters<typeof loadFacts>[0];

/** Minimal shape `alignFacts` needs: two games, aligned by id. */
function coords(ids: number[]): CoordinateSet {
	const index = new Map<number, number>();
	ids.forEach((id, i) => index.set(id, i));
	return {
		ids: Int32Array.from(ids),
		pcs: [new Float32Array(ids.length)],
		umap: [new Float32Array(ids.length), new Float32Array(ids.length)],
		k: 1,
		model: 'test',
		version: 1,
		index
	} as unknown as CoordinateSet;
}

function columns(ids: number[]) {
	const n = ids.length;
	return {
		game_id: Int32Array.from(ids),
		average_weight: new Float32Array(n),
		geek_rating: new Float32Array(n),
		average_rating: new Float32Array(n),
		year_published: Int32Array.from(ids.map(() => 2020)),
		users_rated: Int32Array.from(ids.map(() => 100)),
		cat_code: new Uint8Array(n)
	};
}

describe('loadFacts memo', () => {
	beforeEach(() => {
		queryColumns.mockReset();
		queryColumns.mockImplementation(async () => columns([1, 2]));
	});

	it('queries once for repeated calls with the same coordinate set', async () => {
		const c = coords([1, 2]);
		const a = await loadFacts(c);
		const b = await loadFacts(c);
		expect(queryColumns).toHaveBeenCalledTimes(1);
		// Same object, not merely equal — the point is that no second alignment pass ran.
		expect(a).toBe(b);
	});

	it('shares one query between callers racing on mount', async () => {
		const c = coords([1, 2]);
		const [a, b] = await Promise.all([loadFacts(c), loadFacts(c)]);
		expect(queryColumns).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it('gives a different coordinate set its own facts', async () => {
		await loadFacts(coords([1, 2]));
		await loadFacts(coords([1, 2]));
		// Same ids, different object — a replaced artifact must not reuse the old alignment.
		expect(queryColumns).toHaveBeenCalledTimes(2);
	});

	it('does not memoise a failure', async () => {
		const c = coords([1, 2]);
		queryColumns.mockRejectedValueOnce(new Error('catalog is not ready'));
		await expect(loadFacts(c)).rejects.toThrow('catalog is not ready');
		// One bad query must not poison the map for the rest of the session.
		const ok = await loadFacts(c);
		expect(ok).toBeDefined();
		expect(queryColumns).toHaveBeenCalledTimes(2);
	});

	it('_resetFacts drops the memo', async () => {
		const c = coords([1, 2]);
		await loadFacts(c);
		_resetFacts(c);
		await loadFacts(c);
		expect(queryColumns).toHaveBeenCalledTimes(2);
	});
});
