/**
 * Serialize the similarity-explorer dataset to an Arrow IPC stream.
 *
 * DEV-only artifact (see `build.ts`): only what the catalog artifact lacks — the 64-d
 * embedding, playtime, and the family / reimplementation id sets. Everything else the bench
 * needs is read from `/api/catalog` in the browser.
 *
 * Same Arrow-IPC-then-gzip path the catalog and thumbnails artifacts use; the embedding and
 * id columns are `List<…>` so the schema is spelled out explicitly (Arrow can't infer list
 * element types), mirroring `catalog/serialize.ts`. The embedding run is stamped in the
 * schema metadata (`META_VERSION`, `META_MODEL`).
 */
import { Table, Schema, vectorFromArray, tableToIPC, Utf8, Int32, Float32, List, Field } from 'apache-arrow';

export type ExplorerRow = Record<string, unknown>;

/** BigQuery returns INT64 as a `{ value: string }` wrapper (or a number); normalize. */
function num(v: unknown): number | null {
	if (v == null) return null;
	if (typeof v === 'object' && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

/**
 * Model identity rides in the schema metadata, as the coordinates artifact's does
 * (`coordinates/serialize.ts`), so a page reading both can refuse to mix embedding runs.
 */
export const META_VERSION = 'embedding_version';
export const META_MODEL = 'embedding_model';

const floatListType = () => new List(new Field('item', new Float32(), true));
const intListType = () => new List(new Field('item', new Int32(), true));
const strListType = () => new List(new Field('item', new Utf8(), true));

function floatList(rows: ExplorerRow[], name: string) {
	return vectorFromArray(
		rows.map((r) => (Array.isArray(r[name]) ? (r[name] as unknown[]).map((v) => Number(v)) : [])),
		floatListType()
	);
}

function intList(rows: ExplorerRow[], name: string) {
	return vectorFromArray(
		rows.map((r) =>
			Array.isArray(r[name])
				? (r[name] as unknown[]).map((v) => num(v)).filter((n): n is number => n != null)
				: []
		),
		intListType()
	);
}

function strList(rows: ExplorerRow[], name: string) {
	return vectorFromArray(
		rows.map((r) => (Array.isArray(r[name]) ? (r[name] as unknown[]).map((v) => String(v)) : [])),
		strListType()
	);
}

/**
 * Keep only the newest embedding run's rows. A refit leaves a few stragglers on the old
 * version (games BGG dropped or renumbered, which never get re-embedded); comparing their
 * vectors with the new run's is meaningless, but they're no reason to fail a dev build.
 */
function newestRun(rows: ExplorerRow[]): ExplorerRow[] {
	const versions = new Set(rows.map((r) => num(r.embedding_version)).filter((v): v is number => v != null));
	if (versions.size <= 1) return rows;
	const newest = Math.max(...versions);
	const kept = rows.filter((r) => num(r.embedding_version) === newest);
	console.warn(`[similar-explorer] dropped ${rows.length - kept.length} rows from embedding versions older than v${newest}`);
	return kept;
}

export function rowsToArrowIPC(all: ExplorerRow[]): Uint8Array {
	const rows = newestRun(all);
	const table = new Table({
		game_id: vectorFromArray(
			rows.map((r) => num(r.game_id)),
			new Int32()
		),
		complexity: vectorFromArray(
			rows.map((r) => num(r.complexity)),
			new Float32()
		),
		min_playtime: vectorFromArray(
			rows.map((r) => num(r.min_playtime)),
			new Int32()
		),
		max_playtime: vectorFromArray(
			rows.map((r) => num(r.max_playtime)),
			new Int32()
		),
		embedding: floatList(rows, 'embedding'),
		family_ids: intList(rows, 'family_ids'),
		family_labels: strList(rows, 'family_labels'),
		related_ids: intList(rows, 'related_ids'),
		// 0 = "no product line" (family ids are all positive); keeps the column a plain Int32Array.
		product_line_id: vectorFromArray(
			rows.map((r) => num(r.product_line_id) ?? 0),
			new Int32()
		)
	});
	const versions = new Set(rows.map((r) => num(r.embedding_version)).filter((v): v is number => v != null));
	const models = new Set(rows.map((r) => r.embedding_model).filter((m) => m != null).map(String));
	const metadata = new Map<string, string>([
		[META_VERSION, versions.size ? String([...versions][0]) : ''],
		[META_MODEL, models.size ? [...models][0] : '']
	]);
	const schema = new Schema(
		table.schema.fields.map((f) => new Field(f.name, f.type, f.nullable)),
		metadata
	);
	return tableToIPC(new Table(schema, table.batches), 'stream');
}
