import { describe, it, expect } from 'vitest';
import { tableFromIPC, type FixedSizeList } from 'apache-arrow';
import {
	rowsToArrowIPC,
	META_VERSION,
	META_MODEL,
	META_PROFILES,
	META_DIMS,
	type VectorRow,
	type ProfileRow
} from './serialize';

const emb = (seed: number, n = 64) => Array.from({ length: n }, (_, i) => Math.sin(seed + i));

function row(game_id: number, version: number, over: Partial<VectorRow> = {}): VectorRow {
	return {
		game_id: { value: String(game_id) }, // BigQuery INT64 wrapper
		embedding: emb(game_id),
		complexity: 2.5,
		users_rated: { value: '1200' },
		geek_pct: 0.75,
		line: { value: '7' },
		embedding_version: { value: String(version) },
		embedding_model: 'embeddings-v2026',
		...over
	};
}

const PROFILES: ProfileRow[] = [
	{
		name: 'similar',
		weight: 1,
		complexity_band: 0.75,
		max_per_family: 1,
		min_similarity: 0.5,
		min_rating_pct: 0,
		max_rating_pct: 1,
		min_users_rated: 100,
		source_min_users_rated: 0,
		top_k: 10,
		dims: 64,
		distance: 'COSINE'
	},
	{
		name: 'sicko',
		weight: 0.7,
		complexity_band: null,
		max_per_family: 0,
		min_similarity: 0.5,
		min_rating_pct: 0,
		max_rating_pct: 0.8,
		min_users_rated: 30,
		source_min_users_rated: 30,
		top_k: 10,
		dims: 64,
		distance: 'COSINE'
	}
];

describe('rowsToArrowIPC (vectors)', () => {
	it("carries each row's version and the deployed one", () => {
		const t = tableFromIPC(rowsToArrowIPC([row(13, 6), row(188, 5)], PROFILES, 6));
		expect(Array.from(t.getChild('embedding_version')!.toArray() as Int32Array)).toEqual([6, 5]);
		expect(t.schema.metadata.get('deployed_embedding_version')).toBe('6');
		expect(tableFromIPC(rowsToArrowIPC([row(13, 6)], PROFILES)).schema.metadata.get('deployed_embedding_version')).toBe('');
	});
	it('writes a 64-wide float32 embedding per game', () => {
		const t = tableFromIPC(rowsToArrowIPC([row(13, 6), row(188, 6)], PROFILES));
		expect(t.numRows).toBe(2);
		const type = t.getChild('embedding')!.type as FixedSizeList;
		expect(type.listSize).toBe(64);
		expect(String(type.children[0].type)).toBe('Float32');
		expect(t.getChild('game_id')!.get(1)).toBe(188);
	});

	it('keeps every embedding version and records the latest', () => {
		const t = tableFromIPC(rowsToArrowIPC([row(13, 6), row(188, 5)], PROFILES));
		expect(t.numRows).toBe(2);
		expect(t.schema.metadata.get(META_VERSION)).toBe('6');
		expect(t.schema.metadata.get(META_MODEL)).toBe('embeddings-v2026');
	});

	it('ships the profiles as JSON metadata', () => {
		const t = tableFromIPC(rowsToArrowIPC([row(13, 6)], PROFILES));
		expect(JSON.parse(t.schema.metadata.get(META_PROFILES)!)).toEqual(PROFILES);
		expect(t.schema.metadata.get(META_DIMS)).toBe('64');
	});

	it('stores a missing product line as null and geek_pct as 0 when missing', () => {
		const t = tableFromIPC(rowsToArrowIPC([row(13, 6, { line: null, geek_pct: null })], PROFILES));
		expect(t.getChild('line')!.get(0)).toBeNull();
		expect(t.getChild('geek_pct')!.get(0)).toBe(0);
	});

	it('refuses an embedding that is not 64 wide', () => {
		expect(() => rowsToArrowIPC([row(13, 6, { embedding: emb(13, 63) })], PROFILES)).toThrow(/64/);
	});
});
