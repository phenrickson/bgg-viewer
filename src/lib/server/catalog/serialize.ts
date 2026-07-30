/**
 * Serialize catalog rows to an Arrow IPC stream — the format the browser's DuckDB-WASM
 * loads natively. We build the table with an explicit schema (Arrow can't infer the
 * List<Utf8> facet columns) and coerce BigQuery's INT64 wrappers to plain numbers.
 *
 * (Arrow IPC is the interim server-materialized format; the production pipeline will
 * emit the smaller Parquet+zstd — DuckDB-WASM reads either.)
 */
import {
	Table,
	vectorFromArray,
	tableToIPC,
	Utf8,
	Int32,
	Float32,
	Float64,
	List,
	Field
} from 'apache-arrow';
import {
	ALL_SCALAR_COLUMNS,
	ALL_SCALAR_NAMES,
	LIST_COLUMNS,
	INT_LIST_COLUMNS,
	type ScalarKind
} from './columns';

export type CatalogRow = Record<string, unknown>;

/** BigQuery returns INT64 as a `{ value: string }` wrapper (or a number); normalize. */
function num(v: unknown): number | null {
	if (v == null) return null;
	if (typeof v === 'object' && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

function scalarVector(rows: CatalogRow[], name: string, kind: ScalarKind) {
	if (kind === 'string') {
		return vectorFromArray(
			rows.map((r) => (r[name] == null ? null : String(r[name]))),
			new Utf8()
		);
	}
	const nums = rows.map((r) => num(r[name]));
	if (kind === 'int') return vectorFromArray(nums, new Int32());
	if (kind === 'float32') return vectorFromArray(nums, new Float32());
	return vectorFromArray(nums, new Float64());
}

const listType = () => new List(new Field('item', new Utf8(), true));
const intListType = () => new List(new Field('item', new Int32(), true));

function listVector(rows: CatalogRow[], name: string) {
	return vectorFromArray(
		rows.map((r) => (Array.isArray(r[name]) ? (r[name] as string[]) : [])),
		listType()
	);
}

/** Integer-list facets (player counts) — BigQuery may wrap array elements as INT64 objects. */
function intListVector(rows: CatalogRow[], name: string) {
	return vectorFromArray(
		rows.map((r) =>
			Array.isArray(r[name]) ? (r[name] as unknown[]).map((v) => num(v)).filter((n) => n != null) : []
		),
		intListType()
	);
}

export function rowsToArrowIPC(rows: CatalogRow[]): Uint8Array {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const columns: Record<string, any> = {};
	for (const name of ALL_SCALAR_NAMES)
		columns[name] = scalarVector(
			rows,
			name,
			ALL_SCALAR_COLUMNS[name as keyof typeof ALL_SCALAR_COLUMNS]
		);
	for (const name of LIST_COLUMNS) columns[name] = listVector(rows, name);
	for (const name of INT_LIST_COLUMNS) columns[name] = intListVector(rows, name);
	return tableToIPC(new Table(columns), 'stream');
}
