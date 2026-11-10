import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { buildVectorsArtifact } = await import('./build');

const PROFILE = { name: 'similar', weight: 1, complexity_band: null, max_per_family: 1, min_similarity: 0.5, min_rating_pct: 0, max_rating_pct: 1, min_users_rated: 100, source_min_users_rated: 0, top_k: 10, dims: 64, distance: 'COSINE' };
const ROW = { game_id: 13, embedding: Array(64).fill(0.1), complexity: 2, users_rated: 100, geek_pct: 0.5, line: null, embedding_version: 6, embedding_model: 'm' };

/** A BigQuery stand-in: vectors query first, profiles second. */
function client(vectors: unknown[], profiles: unknown[]) {
	return { query: vi.fn(async ({ query }: { query: string }) => [query.includes('similarity_profiles') && !query.includes('PERCENT_RANK') ? profiles : vectors]) };
}

describe('buildVectorsArtifact', () => {
	it('builds Arrow bytes from rows and profiles', async () => {
		const out = await buildVectorsArtifact(client([ROW], [PROFILE]) as never);
		expect(out.byteLength).toBeGreaterThan(0);
	});

	it('refuses to build from zero rows', async () => {
		await expect(buildVectorsArtifact(client([], [PROFILE]) as never)).rejects.toThrow(/zero rows/);
	});

	it('refuses to build without profiles', async () => {
		await expect(buildVectorsArtifact(client([ROW], []) as never)).rejects.toThrow(/profiles/);
	});
});
