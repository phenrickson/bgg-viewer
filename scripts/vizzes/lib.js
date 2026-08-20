/**
 * Shared BigQuery client and viz-builder helpers, used by every file in this folder.
 *
 * Moved out of `build-landing-content.js` verbatim (see git history for the pre-refactor
 * version) so viz modules can import them without each one standing up its own BigQuery
 * client. `bq` is a single client instance, closed over by `q`.
 */
import { BigQuery } from '@google-cloud/bigquery';

/** Exported so a one-off viz needing a different table (e.g. `best_player_counts`) can build its own fully-qualified name without re-deriving the project fallback. */
export const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';

/** The `games_features` table, fully qualified — every query in this folder reads from it. */
export const F = `\`${PROJECT}.analytics.games_features\``;

/** The working set, matching the catalog's own definition so the charts describe what loads. */
export const WORKING = 'users_rated >= 30';

/** Scatter sample size. 500 points read as a cloud; more just costs bytes. */
export const SAMPLE = 500;

const bq = new BigQuery({ projectId: PROJECT });
export const q = async (sql) => (await bq.query({ query: sql }))[0];

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
export const sample = (cols, where) => `
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
export const notable = (cols, where) => `
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
export const label = (rows, n = 6) => {
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

export const scatter = (title, note, xLabel, yLabel, [rows, named], opts = {}) => ({
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
export const columns = (title, note, xLabel, yLabel, rows, tickEvery, precision = 0, say) => {
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

export const bars = (title, note, xLabel, yLabel, rows) => ({
	kind: 'bars',
	title,
	note,
	xLabel,
	yLabel,
	bars: rows.map((r) => ({ label: r.label, value: Number(r.n) }))
});

/** The cloud and its labels, fetched together — they always come as a pair. */
export const pair = (cols, where) => Promise.all([q(sample(cols, where)), q(notable(cols, where))]);

/** Top N values of a repeated string column — the facets this app exists to query by. */
export const topOf = (col, n) => `
	SELECT x AS label, COUNT(*) AS n
	FROM ${F}, UNNEST(${col}) AS x
	WHERE ${WORKING} AND x IS NOT NULL AND x != ''
	GROUP BY label ORDER BY n DESC LIMIT ${n}`;
