/**
 * Serialize thumbnail rows to an Arrow IPC stream — same format and DuckDB-WASM loading
 * path the catalog artifact uses, but two columns instead of twenty-four, so this is a
 * bespoke serializer rather than a reuse of `catalog/serialize.ts`'s facet-column machinery.
 */
import { Table, vectorFromArray, tableToIPC, Utf8, Int32 } from 'apache-arrow';

export type ThumbnailRow = { game_id: unknown; thumbnail: string | null };

/** BigQuery returns INT64 as a `{ value: string }` wrapper (or a number); normalize. */
function num(v: unknown): number | null {
	if (v == null) return null;
	if (typeof v === 'object' && 'value' in v) return Number((v as { value: unknown }).value);
	return Number(v);
}

export function rowsToArrowIPC(rows: ThumbnailRow[]): Uint8Array {
	const table = new Table({
		game_id: vectorFromArray(rows.map((r) => num(r.game_id)), new Int32()),
		thumbnail: vectorFromArray(
			rows.map((r) => (r.thumbnail == null ? null : String(r.thumbnail))),
			new Utf8()
		)
	});
	return tableToIPC(table, 'stream');
}
