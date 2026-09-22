/**
 * The bridge between Explore's filter language and the map's per-point arrays.
 *
 * `Scope` compiles to a SQL `WHERE` that DuckDB answers; the renderer needs a flag per
 * point, aligned to `CoordinateSet.ids`, at 36k points a frame. This module is the join:
 * run the scope's query once, get back a `Uint8Array` the layer can read without a lookup.
 *
 * Why a mask rather than a filtered list: the map draws **the whole landscape** and lights
 * the games in scope. Every point still gets drawn, so what the renderer needs is not "which
 * games survive" but "is this one lit" — a question asked per point, per frame.
 */
import { query } from '$lib/catalog/catalog.svelte';
import type { CoordinateSet } from './coordinates';

/**
 * Which games are in scope, as a flag per coordinate row (1 = lit, 0 = context).
 *
 * `inScope` is the count of lit points, `unplaced` the number of in-scope games the
 * coordinates artifact has no row for — the folk games and bookkeeping entries ("Go Fish",
 * "Unpublished Prototype") that carry no year and too little text to embed. Roughly 245
 * games site-wide, so it is usually 0 and never worth shouting about; the count exists so a
 * page can be honest when someone has filtered down to them specifically.
 */
export interface ScopeMask {
	lit: Uint8Array;
	inScope: number;
	unplaced: number;
}

/**
 * There is deliberately no `allLit()` shortcut.
 *
 * One existed, to skip the query when no filter was set, and it was wrong: the artifact's
 * population is NOT the default scope's. Coordinates are built over `users_rated >= 30 OR
 * year_published >= <this year>` while the default scope is `users_rated >= 30` alone, so
 * "every row in the artifact" silently included ~5,250 thinly-rated upcoming games the
 * default excludes. Only the query knows what a scope means, so every scope goes through it.
 */

/**
 * Run `where` against the in-browser catalog and mark the games it returns.
 *
 * Returns ids only — the map already holds every fact it draws with, so pulling rows here
 * would be a second copy of the same data with a chance to disagree with the first.
 */
export async function scopeMask(coords: CoordinateSet, where: string): Promise<ScopeMask> {
	const rows = await query<{ game_id: number }>(
		`SELECT game_id FROM catalog WHERE ${where}`
	);
	const lit = new Uint8Array(coords.ids.length);
	let inScope = 0;
	let unplaced = 0;
	for (const r of rows) {
		const i = coords.index.get(Number(r.game_id));
		if (i === undefined) {
			unplaced++;
			continue;
		}
		if (!lit[i]) {
			lit[i] = 1;
			inScope++;
		}
	}
	return { lit, inScope, unplaced };
}
