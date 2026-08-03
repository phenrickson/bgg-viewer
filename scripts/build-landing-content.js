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
 * Usage: node scripts/build-landing-content.js
 *
 * All `note` strings are PLACEHOLDER — Phil writes the final copy.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const F = `\`${PROJECT}.analytics.games_features\``;
const BPC = `\`${PROJECT}.analytics.best_player_counts\``;

/** The working set, matching the catalog's own definition so the charts describe what loads. */
const WORKING = 'users_rated >= 30';

/** Scatter sample size. 500 points read as a cloud; more just costs bytes. */
const SAMPLE = 500;

const bq = new BigQuery({ projectId: PROJECT });
const q = async (sql) => (await bq.query({ query: sql }))[0];
const num = (v) => (v == null ? null : Number(v));

/** Deterministic sample — FARM_FINGERPRINT so a rebuild with unchanged data is byte-stable. */
const sample = (cols, where) => `
	SELECT ${cols} FROM ${F}
	WHERE ${WORKING} AND ${where}
	ORDER BY FARM_FINGERPRINT(CAST(game_id AS STRING)) LIMIT ${SAMPLE}`;

const scatter = (title, note, xLabel, yLabel, rows) => ({
	kind: 'scatter',
	title,
	note,
	xLabel,
	yLabel,
	points: rows.map((r) => [Number(r.x), Number(r.y)])
});

const columns = (title, note, xLabel, yLabel, rows, tickEvery, precision = 0) => ({
	kind: 'columns',
	title,
	note,
	xLabel,
	yLabel,
	bins: rows.map((r) => [Number(r.v), Number(r.n)]),
	tickEvery,
	precision
});

const bars = (title, note, xLabel, yLabel, rows) => ({
	kind: 'bars',
	title,
	note,
	xLabel,
	yLabel,
	bars: rows.map((r) => ({ label: r.label, value: Number(r.n) }))
});

/** Top N values of a repeated string column — the facets this app exists to query by. */
const topOf = (col, n) => `
	SELECT x AS label, COUNT(*) AS n
	FROM ${F}, UNNEST(${col}) AS x
	WHERE ${WORKING} AND x IS NOT NULL AND x != ''
	GROUP BY label ORDER BY n DESC LIMIT ${n}`;

console.log(`querying ${PROJECT}…`);

const [
	weightRating,
	geekAverage,
	popularityQuality,
	timeWeight,
	byYear,
	ratingDist,
	weightDist,
	bestAt,
	topMechanics,
	topCategories,
	topDesigners,
	featuredRows,
	statsRows
] = await Promise.all([
	q(sample('ROUND(average_weight,2) AS x, ROUND(average_rating,2) AS y', 'average_weight > 0 AND average_rating > 0')),
	q(sample('ROUND(average_rating,2) AS x, ROUND(geek_rating,2) AS y', 'geek_rating > 0 AND average_rating > 0')),
	q(sample('users_rated AS x, ROUND(geek_rating,2) AS y', 'geek_rating > 0')),
	// `max_playtime` is the upper bound of the stated range — there is no single
	// `playing_time` column on games_features.
	q(sample('max_playtime AS x, ROUND(average_weight,2) AS y', 'average_weight > 0 AND max_playtime BETWEEN 10 AND 300')),

	q(`SELECT year_published AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	   GROUP BY v ORDER BY v`),

	q(`SELECT ROUND(average_rating*2)/2 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_rating > 0 GROUP BY v ORDER BY v`),

	q(`SELECT ROUND(average_weight*4)/4 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_weight > 0 GROUP BY v ORDER BY v`),

	// The flagship feature: which player count a game is BEST at. BGG cannot query this.
	q(`SELECT SAFE_CAST(TRIM(x) AS INT64) AS v, COUNT(*) AS n
	   FROM ${F} f JOIN ${BPC} b USING (game_id),
	        UNNEST(SPLIT(b.best_player_counts, ',')) AS x
	   WHERE f.users_rated >= 30 AND TRIM(x) != ''
	   GROUP BY v HAVING v BETWEEN 1 AND 8 ORDER BY v`),

	q(topOf('mechanics', 12)),
	q(topOf('categories', 12)),
	q(topOf('designers', 12)),

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

/**
 * Order matters — this is the rotation. Alternating form (cloud, shape, ranking) means two
 * consecutive days never look alike, which is what a rotation is for.
 */
const vizzes = [
	scatter(
		'Complexity against rating',
		'PLACEHOLDER — every rated game, community weight on the x axis and average rating on the y.',
		'Complexity',
		'Average rating',
		weightRating
	),
	columns(
		'Games released each year',
		'PLACEHOLDER — rated releases by year of publication.',
		'Year',
		'Games',
		byYear,
		5
	),
	bars(
		'The most common mechanics',
		'PLACEHOLDER — how often each mechanic appears across the catalog.',
		'Games',
		'Mechanic',
		topMechanics
	),
	scatter(
		'Geek rating against average',
		'PLACEHOLDER — the geek rating is Bayesian, so thinly-rated games are pulled toward the mean. That is the bend.',
		'Average rating',
		'Geek rating',
		geekAverage
	),
	columns(
		'How player counts shake out',
		'PLACEHOLDER — the count each game is *best* at. This is the question BGG cannot answer.',
		'Players',
		'Games',
		bestAt,
		1
	),
	bars(
		'The most common categories',
		'PLACEHOLDER — how often each category appears across the catalog.',
		'Games',
		'Category',
		topCategories
	),
	columns(
		'What the catalog is rated',
		'PLACEHOLDER — average rating, in half-point buckets.',
		'Average rating',
		'Games',
		ratingDist,
		4,
		1
	),
	scatter(
		'Popularity against rating',
		'PLACEHOLDER — how many people rated a game against how it scores. Note the log scale.',
		'Ratings',
		'Geek rating',
		popularityQuality
	),
	bars(
		'The most prolific designers',
		'PLACEHOLDER — credited games per designer across the catalog.',
		'Games',
		'Designer',
		topDesigners
	),
	columns(
		'How heavy the catalog is',
		'PLACEHOLDER — community complexity, in quarter-point buckets.',
		'Complexity',
		'Games',
		weightDist,
		4,
		2
	),
	scatter(
		'Playing time against complexity',
		'PLACEHOLDER — stated playing time against community weight.',
		'Minutes',
		'Complexity',
		timeWeight
	)
];

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
