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
 * Usage: node scripts/build-landing-content.js
 *
 * All `note` strings are PLACEHOLDER — Phil writes the final copy.
 */
import { writeFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { F, WORKING, PROJECT, q, pair, scatter, columns, bars } from './vizzes/lib.js';

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
	req(['scatter', 'columns', 'bars'].includes(mod.kind), 'missing/invalid "kind"');
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
	} else {
		req(typeof mod.query === 'string' && mod.query, `${mod.kind} viz missing "query"`);
		if (mod.kind === 'columns') {
			req(typeof mod.tickEvery === 'number', 'columns viz missing "tickEvery"');
			req(typeof mod.precision === 'number', 'columns viz missing "precision"');
		}
	}
}

/** Run one viz module's query/queries and build its `Viz`. */
async function runViz(mod) {
	if (mod.kind === 'scatter') {
		const rows = await pair(mod.cols, mod.where, mod.sample);
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
	return bars(mod.title, mod.note, mod.xLabel, mod.yLabel, rows);
}

console.log(`querying ${PROJECT}…`);

const vizModules = await loadVizModules();

const [vizzes, featuredRows, statsRows] = await Promise.all([
	Promise.all(vizModules.map(runViz)),

	q(`SELECT game_id, name, year_published, ROUND(geek_rating,2) AS geek,
	          ROUND(average_weight,2) AS weight, users_rated, image, thumbnail
	   FROM ${F}
	   WHERE users_rated >= 8000 AND COALESCE(image, thumbnail) IS NOT NULL
	   ORDER BY geek_rating DESC LIMIT 24`),

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
	featured: featuredRows.map((g) => ({
		id: Number(g.game_id),
		name: g.name,
		year: num(g.year_published),
		geek: num(g.geek),
		weight: num(g.weight),
		usersRated: Number(g.users_rated),
		image: g.thumbnail ?? g.image,
		note: 'PLACEHOLDER — Phil writes the featured blurb.'
	}))
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
