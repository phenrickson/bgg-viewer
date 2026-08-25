/**
 * Build the landing page's warm-gap content from BigQuery.
 *
 * This runs at BUILD time, not at request time, and that is the whole point: the gap it fills
 * starts the moment the landing page finishes rendering, so anything needing a round-trip
 * would arrive after the problem it solves. It is also the only thing that works on a cold
 * container, where the server is busy building the catalog and cannot answer anything
 * promptly for ~22 seconds.
 *
 * WHERE THIS RUNS: not in the Dockerfile. The `build` stage is a plain `node:22-slim` with no
 * GCP credentials, so a query there cannot work. It runs as a step in release-please.yml,
 * which has already authenticated, and `COPY . .` picks the output up.
 *
 * ONE output file, committed: `src/lib/landing/content.json`. CI overwrites it in the working
 * tree before `docker build` and never commits the result. An earlier version wrote a second
 * `content.generated.json` and picked between the two at runtime — which shipped BOTH copies
 * in the bundle, 12.4 KB of pure duplication, because the fallback import kept the file alive
 * no matter which one won.
 *
 * VIZZES live one-per-file in `scripts/vizzes/*.viz.js` — see `vizzes/README.md` to add one.
 * This file only discovers them, runs their queries in parallel, and assembles the JSON; the
 * shared BigQuery client and the scatter/columns/bars builders live in `vizzes/lib.js`.
 *
 * FEATURED GAMES follow the same one-per-file pattern, in `scripts/featured/*.featured.js` —
 * see that folder's `lib.js` doc comment. Every featured game carries a computed rank fact
 * ("Ranked #N of M rated games — top X%", the game detail page's own language); a game pulled
 * in BY a category also carries that category's fun fact. Nothing here is hand-written copy.
 *
 * Usage: node scripts/build-landing-content.js
 */
import { writeFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { F, WORKING, PROJECT, q, pair, scatter, columns, bars, line, stack, range, ridge } from './vizzes/lib.js';
import { loadFeaturedModules, rankFact } from './featured/lib.js';

const num = (v) => (v == null ? null : Number(v));

const VIZZES_URL = new URL('./vizzes/', import.meta.url);

/**
 * Discover viz modules: every `*.viz.js` file in scripts/vizzes/, sorted by filename so the
 * two-digit prefix controls array order — which decides which two vizzes land in the same
 * WarmGap slot pairing (`day` vs `day+1` in rotation.ts).
 */
async function loadVizModules() {
	const files = readdirSync(VIZZES_URL)
		.filter((f) => f.endsWith('.viz.js'))
		.sort();
	return Promise.all(
		files.map(async (file) => {
			const mod = (await import(new URL(file, VIZZES_URL))).default;
			validate(mod, file);
			return mod;
		})
	);
}

/** A malformed viz file fails the build loudly, with the filename — never a silently dropped viz. */
function validate(mod, file) {
	const req = (cond, msg) => {
		if (!cond) throw new Error(`${file}: ${msg}`);
	};
	req(mod && typeof mod === 'object', 'default export must be an object');
	req(typeof mod.id === 'string' && mod.id, 'missing "id"');
	req(
		['scatter', 'columns', 'bars', 'line', 'stack', 'range', 'ridge'].includes(mod.kind),
		'missing/invalid "kind"'
	);
	req(typeof mod.title === 'string' && mod.title, 'missing "title"');
	req(typeof mod.note === 'string' && mod.note, 'missing "note"');
	req(typeof mod.xLabel === 'string' && mod.xLabel, 'missing "xLabel"');
	req(typeof mod.yLabel === 'string' && mod.yLabel, 'missing "yLabel"');
	if (mod.kind === 'scatter') {
		req(typeof mod.cols === 'string' && mod.cols, 'scatter viz missing "cols"');
		req(typeof mod.where === 'string' && mod.where, 'scatter viz missing "where"');
		req(
			mod.sample === undefined || (Number.isInteger(mod.sample) && mod.sample > 0),
			'scatter viz "sample" must be a positive integer if set'
		);
		const namesArray = (v) => Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'string' && n);
		req(
			mod.opts?.highlights === undefined || namesArray(mod.opts.highlights),
			'scatter viz "opts.highlights" must be a non-empty array of exact game names if set'
		);
		req(
			mod.opts?.exclude === undefined || namesArray(mod.opts.exclude),
			'scatter viz "opts.exclude" must be a non-empty array of exact game names if set'
		);
	} else {
		req(typeof mod.query === 'string' && mod.query, `${mod.kind} viz missing "query"`);
		if (mod.kind === 'columns') {
			req(typeof mod.tickEvery === 'number', 'columns viz missing "tickEvery"');
			req(typeof mod.precision === 'number', 'columns viz missing "precision"');
		}
		if (mod.kind === 'bars') {
			req(
				mod.style === undefined || mod.style === 'bars' || mod.style === 'dots',
				'bars viz "style" must be "bars" or "dots" if set'
			);
		}
		if (mod.kind === 'ridge') {
			req(
				Array.isArray(mod.order) && mod.order.length > 0 && mod.order.every((s) => typeof s === 'string'),
				'ridge viz missing "order" (array of lane labels, top-to-bottom draw order)'
			);
		}
	}
}

/** Run one viz module's query/queries and build its `Viz`. */
async function runViz(mod) {
	if (mod.kind === 'scatter') {
		const rows = await pair(mod.cols, mod.where, mod.sample, mod.opts ?? {});
		return scatter(mod.title, mod.note, mod.xLabel, mod.yLabel, rows, mod.opts ?? {});
	}
	const rows = await q(mod.query);
	if (mod.kind === 'columns') {
		return columns(
			mod.title,
			mod.note,
			mod.xLabel,
			mod.yLabel,
			rows,
			mod.tickEvery,
			mod.precision,
			mod.calloutTemplate
		);
	}
	if (mod.kind === 'line') {
		return line(mod.title, mod.note, mod.xLabel, mod.yLabel, rows, mod.opts ?? {});
	}
	if (mod.kind === 'stack') {
		return stack(mod.title, mod.note, mod.xLabel, mod.yLabel, rows, mod.tickEvery, mod.calloutTemplate);
	}
	if (mod.kind === 'range') {
		return range(mod.title, mod.note, mod.xLabel, mod.yLabel, rows, mod.precision);
	}
	if (mod.kind === 'ridge') {
		return ridge(mod.title, mod.note, mod.xLabel, mod.yLabel, rows, mod.order, mod.precision, mod.gridSize);
	}
	return bars(mod.title, mod.note, mod.xLabel, mod.yLabel, rows, mod.style);
}

/**
 * The featured pool's target size. ~19 of these are claimed by the category modules
 * (16-17 `top-of-year` picks + 3 single-game categories as of writing); the rest fill from
 * the plain top-by-geek-rating query below, same as the whole pool used to be.
 */
const TARGET_POOL_SIZE = 30;

/**
 * Build the featured pool: run every category's query, dedup the picks by game_id (first
 * category in file order wins — see `featured/lib.js`), fill remaining slots with top-rated
 * games excluding anything already picked, then fetch full details + rank/percentile ONCE for
 * the whole final pool (not per-game, not per-category).
 */
async function buildFeatured(featuredModules) {
	const categoryResults = await Promise.all(
		featuredModules.map(async (mod) => ({ mod, rows: await q(mod.query) }))
	);

	/** game_id -> the category module that claimed it, or `null` for a plain top-rated fill. */
	const picks = new Map();
	for (const { mod, rows } of categoryResults) {
		for (const row of rows) {
			const id = Number(row.game_id);
			if (!picks.has(id)) picks.set(id, mod);
		}
	}

	// The `top-rated` fill is NOT a discovered category: it needs every other category's picks
	// first (to exclude them) and a dynamic LIMIT, parameters no category module takes.
	const remaining = TARGET_POOL_SIZE - picks.size;
	if (remaining > 0) {
		const excludeClause = picks.size ? `AND game_id NOT IN (${[...picks.keys()].join(',')})` : '';
		const fillRows = await q(`SELECT game_id FROM ${F}
			WHERE users_rated >= 8000 AND geek_rating > 0 AND COALESCE(image, thumbnail) IS NOT NULL
			${excludeClause}
			ORDER BY geek_rating DESC LIMIT ${remaining}`);
		for (const row of fillRows) picks.set(Number(row.game_id), null);
	}

	const poolIds = [...picks.keys()];

	const [detailRows, rankRows] = await Promise.all([
		q(`SELECT game_id, name, year_published, ROUND(geek_rating,2) AS geek,
		          ROUND(average_weight,2) AS weight, users_rated, image, thumbnail,
		          categories, mechanics, designers, publishers
		   FROM ${F} WHERE game_id IN (${poolIds.join(',')})`),

		// Rank/percentile for the WHOLE pool in one query, via a window function over every
		// rated game — not one correlated-subquery lookup per featured game. `geek_pct` is the
		// RANK-based analogue of the game detail page's exact `pct()` (percent of rated games
		// strictly below this one); close enough for "top X%" display, not worth a second query
		// shape to make tie-exact.
		q(`
			WITH ranked AS (
				SELECT game_id,
					RANK() OVER (ORDER BY geek_rating DESC) AS geek_pos,
					COUNT(*) OVER () AS geek_n
				FROM ${F} WHERE geek_rating > 0
			)
			SELECT game_id, geek_pos, geek_n,
				100.0 * (geek_n - geek_pos) / NULLIF(geek_n - 1, 0) AS geek_pct
			FROM ranked WHERE game_id IN (${poolIds.join(',')})`)
	]);

	const detailById = new Map(detailRows.map((r) => [Number(r.game_id), r]));
	const rankById = new Map(rankRows.map((r) => [Number(r.game_id), r]));

	return poolIds
		.map((id) => {
			const d = detailById.get(id);
			const r = rankById.get(id);
			const mod = picks.get(id);
			const game = {
				id,
				name: d.name,
				year: num(d.year_published),
				geek: num(d.geek),
				weight: num(d.weight),
				usersRated: Number(d.users_rated),
				image: d.thumbnail ?? d.image,
				// Capped per type, not one shared total — a game with a dozen mechanics
				// shouldn't crowd out its (usually singular) publisher. Order is
				// identity-first (who made it) then attributes (what it is).
				publishers: (d.publishers ?? []).slice(0, 1),
				designers: (d.designers ?? []).slice(0, 2),
				categories: (d.categories ?? []).slice(0, 3),
				mechanics: (d.mechanics ?? []).slice(0, 3)
			};
			return {
				...game,
				note: rankFact(Number(r.geek_pos), Number(r.geek_n), r.geek_pct == null ? null : Number(r.geek_pct)),
				fact: mod ? mod.fact(game) : null
			};
		})
		.sort((a, b) => (b.geek ?? 0) - (a.geek ?? 0));
}

console.log(`querying ${PROJECT}…`);

const vizModules = await loadVizModules();
const featuredModules = await loadFeaturedModules();

const [vizzes, featured, statsRows] = await Promise.all([
	Promise.all(vizModules.map(runViz)),

	buildFeatured(featuredModules),

	// Two scalars over games and one over designers. They CANNOT share a query: unnesting
	// designers multiplies each game by its credit count, so a joined COUNT(*) reports
	// game-designer pairs (41,507) rather than games (30,818).
	q(`SELECT
	     (SELECT COUNT(*) FROM ${F} WHERE ${WORKING}) AS games,
	     (SELECT MAX(year_published) FROM ${F} WHERE ${WORKING}) AS newest_year,
	     (SELECT COUNT(DISTINCT d) FROM ${F}, UNNEST(COALESCE(designers, [])) AS d
	      WHERE ${WORKING}) AS designers`)
]);

const stats = statsRows[0];

const content = {
	builtAt: new Date().toISOString(),
	stats: {
		games: Number(stats.games),
		newestYear: Number(stats.newest_year),
		designers: Number(stats.designers)
	},
	vizzes,
	featured
};

const out = 'src/lib/landing/content.json';
const json = JSON.stringify(content, null, '\t') + '\n';
writeFileSync(out, json);

// The budget is a real constraint, not a hope: this ships inside the JS bundle, so it is
// bytes every visitor downloads before the page paints.
const gz = gzipSync(Buffer.from(json)).length;
console.log(`wrote ${out}`);
console.log(`  vizzes   ${content.vizzes.length}  (${vizzes.map((v) => v.kind).join(', ')})`);
console.log(`  featured ${content.featured.length}`);
console.log(`  stats    ${JSON.stringify(content.stats)}`);
console.log(`  size     ${(json.length / 1024).toFixed(1)} KB raw · ${(gz / 1024).toFixed(1)} KB gzipped`);

if (gz > 60 * 1024) {
	console.error(`\nFAIL: ${(gz / 1024).toFixed(1)} KB gzipped exceeds the 60 KB budget.`);
	process.exit(1);
}
