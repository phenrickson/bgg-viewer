import { describe, it, expect, vi } from 'vitest';
import { parseVectors, DIMS, fetchVectors, loadedVectors, _resetVectors } from './vectors';
import * as artifactFetch from '../catalog/artifact-fetch';
import { rowsToArrowIPC, type VectorRow, type ProfileRow } from '$lib/server/vectors/serialize';

const PROFILES: ProfileRow[] = [
	{ name: 'similar', weight: 1, complexity_band: 0.75, max_per_family: 1, min_similarity: 0.5, min_rating_pct: 0, max_rating_pct: 1, min_users_rated: 100, source_min_users_rated: 0, top_k: 10, dims: 64, distance: 'COSINE' },
	{ name: 'recommender', weight: 0.6, complexity_band: 0.75, max_per_family: 1, min_similarity: 0.5, min_rating_pct: 0.8, max_rating_pct: 1, min_users_rated: 100, source_min_users_rated: 0, top_k: 10, dims: 64, distance: 'COSINE' }
];

function row(id: number, line: number | null): VectorRow {
	return {
		game_id: id,
		embedding: Array.from({ length: 64 }, (_, i) => (i + 1) * id),
		complexity: 2.5,
		users_rated: 500,
		geek_pct: 0.4,
		line,
		embedding_version: 6,
		embedding_model: 'embeddings-v2026'
	};
}

const v = parseVectors(rowsToArrowIPC([row(13, 7), row(188, null)], PROFILES));

describe('parseVectors', () => {
	it('normalises every vector to unit length', () => {
		for (let r = 0; r < v.ids.length; r++) {
			let s = 0;
			for (let d = 0; d < DIMS; d++) s += v.vec[r * DIMS + d] ** 2;
			expect(Math.sqrt(s)).toBeCloseTo(1, 6);
		}
	});

	it('indexes games by id', () => {
		expect(v.index.get(188)).toBe(1);
		expect(v.ids[v.index.get(13)!]).toBe(13);
	});

	it('reads a missing product line as -1', () => {
		expect(v.line[v.index.get(13)!]).toBe(7);
		expect(v.line[v.index.get(188)!]).toBe(-1);
	});

	it('carries the shipped profiles', () => {
		expect(v.profiles.map((p) => p.name)).toEqual(['similar', 'recommender']);
		expect(v.version).toBe(6);
		expect(v.model).toBe('embeddings-v2026');
	});
});

describe('loadedVectors', () => {
	it('is null until the fetch resolves, the set after, and null again after a reset', async () => {
		const bytes = rowsToArrowIPC([row(13, 7)], PROFILES);
		const spy = vi.spyOn(artifactFetch, 'fetchArtifactBytes').mockResolvedValue(bytes);
		_resetVectors();
		expect(loadedVectors()).toBeNull();
		const p = fetchVectors();
		expect(loadedVectors()).toBeNull();
		const got = await p;
		expect(loadedVectors()).toBe(got);
		// Memoised: a second call reuses the same fetch.
		await fetchVectors();
		expect(spy).toHaveBeenCalledTimes(1);
		_resetVectors();
		expect(loadedVectors()).toBeNull();
		spy.mockRestore();
	});
});
