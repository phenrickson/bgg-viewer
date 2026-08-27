/**
 * The client-side catalog: loads the Arrow artifact from `/api/catalog` into DuckDB-WASM
 * once, then answers SQL queries in the browser — no server round-trip, no BigQuery.
 *
 * The wasm + worker are self-hosted (bundled via `?url`), not the CDN the spike used.
 * DuckDB and its runtime are only touched inside `init()` (browser), so this module is
 * safe to import during SSR; the page that uses it also opts out of SSR.
 */
import wasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import wasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { recordLoad } from '$lib/landing/estimate';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

let status = $state<CatalogStatus>('idle');
let count = $state(0);
let error = $state<string | null>(null);
/**
 * Flips true once box art has loaded and joined onto `thumbnails`. Starts false and stays
 * false forever if the fetch fails — a missing thumbnail artifact degrades to today's
 * initials placeholder, never to a broken page. Never gates `status`: thumbnails are fetched
 * only *after* `status` is already `'ready'`, so this can never be the thing a reader waits on.
 */
let thumbnailsReady = $state(false);

/**
 * Admin-only collection filter (Phase 1). `null` = inactive; a table of `owned_collection`
 * only ever exists in DuckDB while this is set. Never touches `Scope`/`toWhere` — this is
 * orthogonal client state, applied by wrapping a `where` string via `appendCollectionFilter`.
 */
let collectionUsername = $state<string | null>(null);

/** Reactive, read-only view of load state for the UI. */
export const catalog = {
	get status() {
		return status;
	},
	get count() {
		return count;
	},
	get error() {
		return error;
	},
	get thumbnailsReady() {
		return thumbnailsReady;
	},
	get collectionUsername() {
		return collectionUsername;
	}
};

let conn: AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;
/** id → name, built once at load so per-filter plot queries can return numbers only. */
let nameById = new Map<number, string>();

async function doInit(): Promise<void> {
	status = 'loading';
	// What the landing page's "about N seconds" is built from. Measured here rather than
	// asked of the server: this is the wait the USER experiences — build, transfer, wasm
	// instantiate, insert and index, all of it — and no server-side number covers that.
	const t0 = performance.now();
	try {
		const duckdb = await import('@duckdb/duckdb-wasm');
		const bundle = await duckdb.selectBundle({
			mvp: { mainModule: wasmMvp, mainWorker: mvpWorker },
			eh: { mainModule: wasmEh, mainWorker: ehWorker }
		});
		const worker = new Worker(bundle.mainWorker!);
		const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
		await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
		conn = await db.connect();

		const res = await fetch('/api/catalog');
		if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
		const buf = new Uint8Array(await res.arrayBuffer());
		// Load into a native table so queries don't re-parse the artifact each time.
		await conn.insertArrowFromIPCStream(buf, { name: 'catalog', create: true });

		// Empty, not absent: every query that joins thumbnails can do so unconditionally —
		// `LEFT JOIN thumbnails USING (game_id)` against zero rows just means every game
		// reads a NULL thumbnail until `loadThumbnails` below fills the table in. No query
		// needs to know whether that has happened yet.
		await conn.query('CREATE TABLE thumbnails (game_id INTEGER, thumbnail VARCHAR)');

		const r = await conn.query('SELECT COUNT(*)::INT AS n FROM catalog');
		count = Number((r.get(0) as { n: number } | null)?.n ?? 0);

		// Build the id→name map once. The plot's per-filter queries return numbers only
		// (x, y, game_id); the tooltip resolves the hovered name here (O(1)), so a scope
		// change never re-marshals ~tens-of-thousands of name strings.
		const names = await conn.query('SELECT game_id, name FROM catalog');
		nameById = new Map(
			names.toArray().map((row) => {
				const o = row.toJSON() as { game_id: number | bigint; name: string };
				return [Number(o.game_id), o.name] as const;
			})
		);

		recordLoad(performance.now() - t0);
		status = 'ready';

		// Fire-and-forget, deliberately after `status = 'ready'`: box art is a cosmetic
		// upgrade over the initials placeholder, not something any interaction blocks on.
		void loadThumbnails();
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
		status = 'error';
	}
}

/**
 * Fetch the thumbnails artifact and fill in the `thumbnails` table `doInit` already
 * created empty. Runs after the catalog is `'ready'` — see the call site above — so a slow
 * or failed thumbnail load never delays first filter, and a failure here degrades to the
 * initials placeholder everywhere `thumbnailsReady` is read, not to a broken page.
 */
async function loadThumbnails(): Promise<void> {
	if (!conn) return;
	try {
		const res = await fetch('/api/thumbnails');
		if (!res.ok) throw new Error(`thumbnails fetch failed (${res.status})`);
		const buf = new Uint8Array(await res.arrayBuffer());
		// `create: false` — the table already exists (empty) from doInit, so this inserts
		// rather than replacing it.
		await conn.insertArrowFromIPCStream(buf, { name: 'thumbnails', create: false });
		thumbnailsReady = true;
	} catch (e) {
		console.error('thumbnails load failed (non-fatal — initials placeholder stays)', e);
	}
}

/** Idempotent — first call loads the catalog; later calls await the same load. */
export function initCatalog(): Promise<void> {
	return (initPromise ??= doInit());
}

/**
 * Admin-only (Phase 1): scope the catalog to one BGG username's owned games. Replaces
 * `owned_collection` wholesale rather than diffing — the id list is small (a personal
 * collection, not the working set) and this only ever runs on an explicit admin action, never
 * per filter change.
 */
export async function applyCollectionFilter(username: string, gameIds: number[]): Promise<void> {
	if (!conn) throw new Error('catalog is not ready');
	await conn.query('DROP TABLE IF EXISTS owned_collection');
	await conn.query('CREATE TABLE owned_collection (game_id INTEGER)');
	if (gameIds.length > 0) {
		const values = gameIds.map((id) => `(${Math.trunc(id)})`).join(', ');
		await conn.query(`INSERT INTO owned_collection VALUES ${values}`);
	}
	collectionUsername = username;
}

export async function clearCollectionFilter(): Promise<void> {
	if (conn) await conn.query('DROP TABLE IF EXISTS owned_collection');
	collectionUsername = null;
}

/** Wrap a `where` body with the active collection filter, if any — see `applyCollectionFilter`. */
export function appendCollectionFilter(where: string): string {
	return collectionUsername != null
		? `${where} AND game_id IN (SELECT game_id FROM owned_collection)`
		: where;
}

/** Resolve a game's name from its id (map built once at load) — for the plot tooltip. */
export function nameOf(id: number): string | undefined {
	return nameById.get(Number(id));
}

/** Run a SQL query against the in-browser `catalog` table; rows as plain objects.
 * Fine for small result sets (aggregates, facets); for large clouds use `queryColumns`. */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
	if (!conn) throw new Error('catalog is not ready');
	const result = await conn.query(sql);
	return result.toArray().map((row) => row.toJSON()) as T[];
}

/**
 * Column-oriented query for large result sets (the plot cloud). Returns each requested
 * column as a native typed array straight from Arrow — no per-row object/`toJSON`
 * materialization. Arrow's row proxy makes `toArray().map(toJSON)` cost ~tens of ms per
 * thousand rows; a 30k-point scatter pays that on every filter change. Pulling columns
 * skips it entirely (near-zero-copy for numeric columns).
 */
export async function queryColumns(
	sql: string,
	cols: readonly string[]
): Promise<Record<string, ArrayLike<number>>> {
	if (!conn) throw new Error('catalog is not ready');
	const result = await conn.query(sql);
	const out: Record<string, ArrayLike<number>> = {};
	for (const c of cols) {
		const child = result.getChild(c);
		out[c] = (child?.toArray() as ArrayLike<number> | undefined) ?? [];
	}
	return out;
}
