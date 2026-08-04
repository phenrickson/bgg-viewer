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

/**
 * A sample of the catalog STRATIFIED ACROSS RATINGS: order every game by average rating, then
 * take every k-th one. Systematic rather than random, which buys three things at once —
 *
 *   - the sample's rating distribution matches the population's exactly, so the cloud is a
 *     faithful miniature rather than a lucky draw;
 *   - the full range is covered, tails included, instead of a uniform draw thinning out
 *     precisely where the interesting games are;
 *   - it is deterministic, so a rebuild on unchanged data produces byte-identical output.
 *
 * Only x and y are selected. Names live on the annotations (see `notable`) and nowhere else,
 * so 500 points cost 500 number pairs rather than 500 strings.
 */
const sample = (cols, where) => `
	WITH pool AS (
	  SELECT ${cols},
	         ROW_NUMBER() OVER (ORDER BY average_rating, game_id) AS rn,
	         COUNT(*) OVER () AS total
	  FROM ${F}
	  WHERE ${WORKING} AND ${where}
	)
	SELECT x, y FROM pool
	WHERE MOD(rn, GREATEST(1, CAST(DIV(total, ${SAMPLE}) AS INT64))) = 0`;

/**
 * The games to NAME on a cloud — queried separately, and deliberately not part of `points`.
 *
 * An earlier version unioned the 60 most-rated games into the plotted sample so the labels
 * would be recognisable. That worked and was wrong: ~10% of every cloud became the most
 * popular games, which skew better-rated, so a plot described as the whole catalog was a
 * sample biased toward hits. Annotations are drawn as their own marks on top of the cloud,
 * so they never needed to be in it.
 */
const notable = (cols, where) => `
	SELECT ${cols}, name, users_rated AS pop FROM ${F}
	WHERE ${WORKING} AND ${where}
	ORDER BY users_rated DESC LIMIT 250`;

/**
 * Pick the games to name on a cloud.
 *
 * Spread across the x range, not simply the most popular: taking the top N by ratings labels
 * six games in one corner and leaves the rest of the plot anonymous, which teaches nothing
 * about the axis. Bucketing by x and taking the best-known game in each means the labels
 * describe the whole span.
 */
const label = (rows, n = 6) => {
	const usable = rows.filter((r) => r.name && r.x != null && r.y != null);
	if (!usable.length) return [];
	const xs = usable.map((r) => Number(r.x));
	const lo = Math.min(...xs);
	const hi = Math.max(...xs);
	if (hi === lo) return [];

	const buckets = new Map();
	for (const r of usable) {
		const b = Math.min(n - 1, Math.floor(((Number(r.x) - lo) / (hi - lo)) * n));
		const cur = buckets.get(b);
		if (!cur || Number(r.pop) > Number(cur.pop)) buckets.set(b, r);
	}
	return [...buckets.values()]
		.sort((a, b) => Number(a.x) - Number(b.x))
		.map((r) => ({ x: Number(r.x), y: Number(r.y), label: r.name }));
};

const scatter = (title, note, xLabel, yLabel, [rows, named], opts = {}) => ({
	kind: 'scatter',
	title,
	note,
	xLabel,
	yLabel,
	points: rows.map((r) => [Number(r.x), Number(r.y)]),
	annotations: label(named),
	...opts
});

/**
 * `callout` is a function of the data, not a hand-written sentence: the numbers in it are
 * computed from the same rows the bars are drawn from, so it cannot drift when the catalog
 * refreshes and the peak moves.
 */
const columns = (title, note, xLabel, yLabel, rows, tickEvery, precision = 0, say) => {
	const bins = rows.map((r) => [Number(r.v), Number(r.n)]);
	const total = bins.reduce((s, [, n]) => s + n, 0);
	const peak = bins.reduce((a, b) => (b[1] > a[1] ? b : a), bins[0]);
	return {
		kind: 'columns',
		title,
		note,
		xLabel,
		yLabel,
		bins,
		tickEvery,
		precision,
		callout: say
			? { text: say(peak[0], peak[1], Math.round((peak[1] / total) * 100), total), at: peak[0] }
			: undefined
	};
};

const bars = (title, note, xLabel, yLabel, rows) => ({
	kind: 'bars',
	title,
	note,
	xLabel,
	yLabel,
	bars: rows.map((r) => ({ label: r.label, value: Number(r.n) }))
});

/** The cloud and its labels, fetched together — they always come as a pair. */
const pair = (cols, where) => Promise.all([q(sample(cols, where)), q(notable(cols, where))]);

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
	pair('ROUND(average_weight,2) AS x, ROUND(average_rating,2) AS y', 'average_weight > 0 AND average_rating > 0'),
	pair('ROUND(average_rating,2) AS x, ROUND(geek_rating,2) AS y', 'geek_rating > 0 AND average_rating > 0'),
	pair('users_rated AS x, ROUND(geek_rating,2) AS y', 'geek_rating > 0'),
	// `max_playtime` is the upper bound of the stated range — there is no single
	// `playing_time` column on games_features.
	pair('max_playtime AS x, ROUND(average_weight,2) AS y', 'average_weight > 0 AND max_playtime BETWEEN 10 AND 300'),

	q(`SELECT year_published AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND year_published BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE()) - 1
	   GROUP BY v ORDER BY v`),

	q(`SELECT ROUND(average_rating*2)/2 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_rating > 0 GROUP BY v ORDER BY v`),

	// `num_weights >= 5` is load-bearing. Without it the peak lands on 1.00 -- the FLOOR of
	// BGG's 1-5 scale -- where 51% of the games have three or fewer weight votes. That is a
	// boundary pile-up of thinly-rated games, not a community preference, and the chart
	// confidently explained it as one. games/[id]/+page.server.ts already carries a comment
	// about exactly this trap; this query had walked straight into it.
	q(`SELECT ROUND(average_weight*4)/4 AS v, COUNT(*) AS n FROM ${F}
	   WHERE ${WORKING} AND average_weight > 0 AND num_weights >= 5
	   GROUP BY v ORDER BY v`),

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
		'PLACEHOLDER — a sample of the catalog stratified across ratings; named games are called out on top.',
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
		5,
		0,
		(v, n) => `PLACEHOLDER — ${v} was the biggest year on record, with ${n.toLocaleString()} rated releases.`
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
		1,
		0,
		(v, n, pct, total) => `PLACEHOLDER — ${v} players is the most common sweet spot: ${n.toLocaleString()} games are best at it, more than any other count.`
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
		1,
		(v, n, pct) => `PLACEHOLDER — the catalog piles up around ${v.toFixed(1)}: ${pct}% of games sit in this one half-point bucket.`
	),
	scatter(
		'Popularity against rating',
		'PLACEHOLDER — how many people rated a game against how it scores. Note the log scale on the left.',
		'Ratings',
		'Geek rating',
		popularityQuality,
		// Ratings run from 30 to ~135,000. Linear, that is one clump against the axis and a
		// handful of outliers strung out to the right; the shape only exists in log space.
		{ xLog: true }
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
		2,
		(v, n, pct) => `PLACEHOLDER — ${v.toFixed(2)} is the most common weight, ${pct}% of games with a settled complexity score.`
	),
	scatter(
		'Playing time against complexity',
		'PLACEHOLDER — stated playing time against community weight, over a sample stratified across ratings.',
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
