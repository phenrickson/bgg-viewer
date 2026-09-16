/**
 * Serialize coordinate rows to an Arrow IPC stream: `game_id` Int32, `pc_1..pc_K` and
 * `umap_1/2` Float32. The model identity rides in the schema metadata rather than as a
 * per-row column — it is one value for the whole artifact, and the page shows it in the
 * footer. Bespoke like `thumbnails/serialize.ts`, for the same reason: a handful of typed
 * columns doesn't need the catalog serializer's facet machinery.
 */
import { Table, vectorFromArray, tableToIPC, Int32, Float32, Schema, Field } from 'apache-arrow';
import { PC_COLUMNS } from './columns';

export type CoordinateRow = {
	game_id: unknown;
	umap_1: number | null;
	umap_2: number | null;
	embedding_version: unknown;
	embedding_model: string;
} & Record<`pc_${number}`, number | null>;

/** BigQuery returns INT64 as a `{ value: string }` wrapper (or a number); normalize. */
function num(v: unknown): number {
	if (typeof v === 'object' && v !== null && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

export const META_VERSION = 'embedding_version';
export const META_MODEL = 'embedding_model';
export const META_K = 'k';

export function rowsToArrowIPC(rows: CoordinateRow[]): Uint8Array {
	// One space per artifact, or nothing: the SQL already joins on version, but a row set
	// spanning two versions/models would silently plot two incompatible spaces on one map.
	const versions = new Set(rows.map((r) => num(r.embedding_version)));
	const models = new Set(rows.map((r) => r.embedding_model));
	if (versions.size > 1 || models.size > 1) {
		throw new Error(
			`coordinates artifact spans ${versions.size} versions / ${models.size} models: ` +
				`${[...models].join(',')} v${[...versions].join(',')}`
		);
	}
	const f32 = (key: keyof CoordinateRow) =>
		vectorFromArray(
			rows.map((r) => (r[key] == null ? NaN : Number(r[key]))),
			new Float32()
		);
	const columns: Record<string, ReturnType<typeof f32>> = {
		game_id: vectorFromArray(rows.map((r) => num(r.game_id)), new Int32())
	};
	for (const pc of PC_COLUMNS) columns[pc] = f32(pc as keyof CoordinateRow);
	columns.umap_1 = f32('umap_1');
	columns.umap_2 = f32('umap_2');

	const bare = new Table(columns);
	const metadata = new Map<string, string>([
		[META_VERSION, versions.size ? String([...versions][0]) : ''],
		[META_MODEL, models.size ? String([...models][0]) : ''],
		[META_K, String(PC_COLUMNS.length)]
	]);
	const schema = new Schema(
		bare.schema.fields.map((f) => new Field(f.name, f.type, f.nullable)),
		metadata
	);
	return tableToIPC(new Table(schema, bare.batches), 'stream');
}
