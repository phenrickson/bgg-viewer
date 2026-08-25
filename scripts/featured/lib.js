/**
 * Shared helpers for "featured game" category modules — one file per category in
 * `scripts/featured/*.featured.js`, mirroring `scripts/vizzes/lib.js`'s file-per-viz pattern.
 * The BigQuery client, `F`/`WORKING` and `q()` live in `../vizzes/lib.js` and are imported
 * directly by each category file — same project/table/client either way, no reason to stand
 * up a second one.
 *
 * A category module only has to pick game_ids (`query`) and explain why (`fact`); it does NOT
 * select name/year/geek/weight/etc itself — `build-landing-content.js` fetches those once for
 * the whole deduped pool, not per-category, and hands `fact` the merged row.
 */
import { readdirSync } from 'node:fs';

/**
 * "top N%" — ported verbatim from the game detail page's own percentile phrasing
 * (`src/routes/(app)/games/[id]/+page.svelte`'s `topPct()`), so a featured card's rank fact
 * reads exactly like the number a reader would see if they opened the game themselves. Small
 * pure function, zero Svelte dependency, duplicated rather than shared across the Node/client
 * boundary — this file's own `VizOfTheDay.svelte` already accepts that trade for things like
 * its "nice gridline step" formula. Below 1% keeps a decimal, or every elite game reads as an
 * identical "top 0%".
 */
export function topPct(pctBelow) {
	if (pctBelow == null) return null;
	const top = Math.max(0, 100 - pctBelow);
	const tenth = Math.round(top * 10) / 10;
	if (tenth >= 1) return `top ${Math.max(1, Math.round(top))}%`;
	return `top ${tenth < 0.1 ? '0.1' : tenth.toFixed(1)}%`;
}

/** The baseline fact every featured game carries, regardless of why it was picked. */
export function rankFact(geekPos, geekN, geekPct) {
	return `Ranked #${geekPos.toLocaleString()} of ${geekN.toLocaleString()} rated games — ${topPct(geekPct)}`;
}

const FEATURED_URL = new URL('./', import.meta.url);

/**
 * Discover every `*.featured.js` module, sorted by filename. The numeric prefix controls
 * dedup priority when the pool is built (`build-landing-content.js`): the first category to
 * claim a game_id keeps its fact, a later category matching the same game loses it silently
 * rather than showing two fun facts on one card.
 */
export async function loadFeaturedModules() {
	const files = readdirSync(FEATURED_URL)
		.filter((f) => f.endsWith('.featured.js'))
		.sort();
	return Promise.all(
		files.map(async (file) => {
			const mod = (await import(new URL(file, FEATURED_URL))).default;
			validate(mod, file);
			return mod;
		})
	);
}

/** A malformed category file fails the build loudly, with the filename — never a silently
 *  dropped category. */
function validate(mod, file) {
	const req = (cond, msg) => {
		if (!cond) throw new Error(`${file}: ${msg}`);
	};
	req(mod && typeof mod === 'object', 'default export must be an object');
	req(typeof mod.id === 'string' && mod.id, 'missing "id"');
	req(typeof mod.query === 'string' && mod.query, 'missing "query"');
	req(typeof mod.fact === 'function', 'missing "fact"');
}
