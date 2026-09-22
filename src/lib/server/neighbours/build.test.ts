import { describe, expect, it } from 'vitest';
import { rowsToArtifact, type NeighbourRow } from './build';

const row = (source_id: number, game_id: number, similarity: number, upcoming = false): NeighbourRow => ({
	source_id: { value: String(source_id) },
	game_id,
	upcoming,
	similarity,
	embedding_version: 6,
	embedding_model: 'm'
});

describe('rowsToArtifact', () => {
	it('splits each source into an overall list and an upcoming list, best first, capped at n', () => {
		const rows = [row(1, 10, 0.9), row(1, 11, 0.8, true), row(1, 12, 0.7), row(1, 13, 0.2, true), row(2, 20, 0.5)];
		const a = rowsToArtifact(rows, 2);
		expect(a.all['1'].map((n) => n.id)).toEqual([10, 11]);
		expect(a.upcoming['1'].map((n) => n.id)).toEqual([11, 13]);
		expect(a.all['2']).toEqual([{ id: 20, sim: 0.5 }]);
		expect(a.upcoming['2']).toBeUndefined();
		expect(a).toMatchObject({ model: 'm', version: 6, n: 2 });
	});
	it('refuses an empty or mixed-version row set', () => {
		expect(() => rowsToArtifact([])).toThrow(/zero rows/);
		expect(() => rowsToArtifact([row(1, 10, 0.9), { ...row(1, 11, 0.8), embedding_version: 7 }])).toThrow(/versions/);
	});
});
