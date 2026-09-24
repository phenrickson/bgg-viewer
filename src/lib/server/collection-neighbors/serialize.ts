/**
 * Serialize collection-neighbour rows to an Arrow IPC stream — the shape the browser loads
 * into DuckDB as `collection_neighbors`. Names, thumbnails and ratings are deliberately
 * absent: the catalog is already in the browser, so the page joins `neighbor_id` to it.
 */
import { Table, vectorFromArray, tableToIPC, Int32, Float32, Utf8, Schema, Field } from 'apache-arrow';

export interface NeighbourRow {
	part: string;
	style: string;
	seed_id: unknown;
	rank: unknown;
	neighbor_id: unknown;
	similarity: number;
	score: number;
}

/** BigQuery returns INT64 as a `{ value: string }` wrapper (or a number); normalize. */
function num(v: unknown): number {
	if (typeof v === 'object' && v !== null && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

export const META_USERNAME = 'username';
export const META_BUILT_AT = 'built_at';

export function rowsToArrowIPC(rows: NeighbourRow[], username: string, builtAt: string): Uint8Array {
	const bare = new Table({
		part: vectorFromArray(rows.map((r) => r.part), new Utf8()),
		style: vectorFromArray(rows.map((r) => r.style), new Utf8()),
		seed_id: vectorFromArray(rows.map((r) => num(r.seed_id)), new Int32()),
		rank: vectorFromArray(rows.map((r) => num(r.rank)), new Int32()),
		neighbor_id: vectorFromArray(rows.map((r) => num(r.neighbor_id)), new Int32()),
		similarity: vectorFromArray(rows.map((r) => Number(r.similarity)), new Float32()),
		score: vectorFromArray(rows.map((r) => Number(r.score)), new Float32())
	});
	const schema = new Schema(
		bare.schema.fields.map((f) => new Field(f.name, f.type, f.nullable)),
		new Map([
			[META_USERNAME, username],
			[META_BUILT_AT, builtAt]
		])
	);
	return tableToIPC(new Table(schema, bare.batches), 'stream');
}
