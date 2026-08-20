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

/** Default scatter sample size — a `.viz.js` file can override via its `sample` field. More just costs bytes (see the budget check in build-landing-content.js). */
export const SAMPLE = 1000;

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
 * so N points cost N number pairs rather than N strings.
 */
export const sample = (cols, where, n = SAMPLE) => `
	WITH pool AS (
	  SELECT ${cols},
	         ROW_NUMBER() OVER (ORDER BY average_rating, game_id) AS rn,
	         COUNT(*) OVER () AS total
	  FROM ${F}
	  WHERE ${WORKING} AND ${where}
	)
	SELECT x, y FROM pool
	WHERE MOD(rn, GREATEST(1, CAST(DIV(total, ${n}) AS INT64))) = 0`;

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
	// Weighted mean of the bucket midpoints — `v` IS the bucket center (the query rounds to
	// it), so this is the true mean to within half a bucket width. Cheaper than a second query
	// for callers whose claim is about the average rather than the peak bucket.
	const mean = total > 0 ? bins.reduce((s, [v, n]) => s + v * n, 0) / total : 0;
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
			? { text: say(peak[0], peak[1], Math.round((peak[1] / total) * 100), total, mean), at: peak[0] }
			: undefined
	};
};

/**
 * Pivots `{x, series, y}` triples (one row per series/x-point, however many series that is)
 * into the wide per-x shape both `line` and `stack` render from — so a viz file just returns
 * whatever its query naturally produces (a single-series file's query can alias a literal
 * string as `series`), regardless of which of the two kinds it's building.
 */
const pivot = (rows) => {
	const keys = [];
	const byX = new Map();
	for (const r of rows) {
		const key = String(r.series);
		if (!keys.includes(key)) keys.push(key);
		const x = Number(r.x);
		if (!byX.has(x)) byX.set(x, { x });
		byX.get(x)[key] = Number(r.y);
	}
	return {
		series: keys.map((key) => ({ key, label: key })),
		points: [...byX.values()].sort((a, b) => a.x - b.x)
	};
};

// VizOfTheDay cycles 6 categorical colors; a 7th series would collide with the 1st and render
// indistinguishable from it instead of failing anything — this makes that loud, for both kinds
// that can have multiple series.
const checkSeriesCount = (kind, title, series) => {
	if (series.length > 6) {
		throw new Error(`${title}: ${kind} viz has ${series.length} series, but only 6 colors exist`);
	}
};

/** A trend chart — one or more series sharing one x-axis, drawn as connected lines. */
export const line = (title, note, xLabel, yLabel, rows, opts = {}) => {
	const { series, points } = pivot(rows);
	checkSeriesCount('line', title, series);
	return { kind: 'line', title, note, xLabel, yLabel, series, points, ...opts };
};

/**
 * Stacked vertical bars — one or more series sharing one x-axis, drawn as cumulative segments
 * instead of lines. `tickEvery` labels every Nth bucket by index, same as `columns()`.
 *
 * `say`, like `columns()`'s, is a function of the data rather than a hand-written sentence —
 * always about the LAST point (the most recent year), since that's the number a "rise of X"
 * chart exists to update as the catalog refreshes. `pivot()` sorts `points` ascending by x, so
 * the last element is always the most recent year regardless of the query's own row order.
 */
export const stack = (title, note, xLabel, yLabel, rows, tickEvery, say) => {
	const { series, points } = pivot(rows);
	checkSeriesCount('stack', title, series);
	const last = points[points.length - 1];
	const total = series.reduce((s, ser) => s + (last?.[ser.key] ?? 0), 0);
	const count = last?.[series[0]?.key] ?? 0;
	const pct = total > 0 ? Math.round((count / total) * 100) : 0;
	return {
		kind: 'stack',
		title,
		note,
		xLabel,
		yLabel,
		series,
		points,
		tickEvery,
		callout: say && last ? { text: say(last.x, count, pct, total) } : undefined
	};
};

export const bars = (title, note, xLabel, yLabel, rows, style) => ({
	kind: 'bars',
	title,
	note,
	xLabel,
	yLabel,
	bars: rows.map((r) => ({ label: r.label, value: Number(r.n) })),
	...(style ? { style } : {})
});

/**
 * A median + 50% band (25th-75th percentile) per discrete category — `rows` are expected to
 * already carry `x`/`low`/`mid`/`high` columns (BigQuery's `APPROX_QUANTILES` does the actual
 * statistics; this just rounds and repackages).
 */
export const range = (title, note, xLabel, yLabel, rows, precision = 1) => ({
	kind: 'range',
	title,
	note,
	xLabel,
	yLabel,
	precision,
	points: rows.map((r) => ({
		x: Number(r.x),
		low: Number(Number(r.low).toFixed(precision)),
		mid: Number(Number(r.mid).toFixed(precision)),
		high: Number(Number(r.high).toFixed(precision))
	}))
});

/**
 * Overlapping distribution curves ("ridgeline"/joyplot), one lane per group in `order`. `rows`
 * are sparse `{label, bucket, n}` triples — not every group has games in every bucket — so
 * this reconstructs ONE shared bucket grid across every group (lanes overlay on one x-axis
 * without per-lane interpolation in the renderer), zero-filling wherever a group has none, and
 * normalizes each lane's counts to a share of ITS OWN total: comparing distribution SHAPE, not
 * volume, is the point of a ridge chart, so a group with far more games can't just visually
 * dwarf a smaller one regardless of what their shapes actually look like.
 *
 * `bucketWidth` must match whatever rounding the query used to produce `bucket` (every current
 * ridge query rounds `average_rating` to the nearest eighth, i.e. 0.125).
 */
export const ridge = (title, note, xLabel, yLabel, rows, order, bucketWidth = 0.125, precision = 1) => {
	// Keyed by an integer tick index, not the raw float bucket value — floating-point
	// arithmetic on eighth-point increments can disagree with BigQuery's own ROUND() by a
	// last-bit epsilon, which would silently drop buckets on a raw-float Map lookup.
	const tick = (v) => Math.round(v / bucketWidth);

	let loTick = Infinity;
	let hiTick = -Infinity;
	const byLabel = new Map();
	for (const r of rows) {
		const t = tick(Number(r.bucket));
		if (t < loTick) loTick = t;
		if (t > hiTick) hiTick = t;
		const label = String(r.label);
		if (!byLabel.has(label)) byLabel.set(label, new Map());
		byLabel.get(label).set(t, Number(r.n));
	}

	const ticks = [];
	for (let t = loTick; t <= hiTick; t++) ticks.push(t);
	const buckets = ticks.map((t) => Number((t * bucketWidth).toFixed(3)));

	const lanes = order.map((label) => {
		const counts = byLabel.get(label) ?? new Map();
		const total = [...counts.values()].reduce((s, n) => s + n, 0);
		const density = ticks.map((t) => (total > 0 ? (counts.get(t) ?? 0) / total : 0));
		return { label, n: total, density };
	});

	return { kind: 'ridge', title, note, xLabel, yLabel, precision, buckets, lanes };
};

/** The cloud and its labels, fetched together — they always come as a pair. `n` overrides the default sample size (see `SAMPLE`). */
export const pair = (cols, where, n) => Promise.all([q(sample(cols, where, n)), q(notable(cols, where))]);

/**
 * Top N values of a repeated string column — the facets this app exists to query by.
 * `exclude` drops specific placeholder values that aren't real facets — BGG's own
 * `(Uncredited)` on `designers` is real data, not noise, but it's not a designer either, and
 * at ~19,000 games it would otherwise crowd out every actual name.
 */
export const topOf = (col, n, exclude = []) => {
	const not = exclude.length
		? `AND x NOT IN (${exclude.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')})`
		: '';
	return `
	SELECT x AS label, COUNT(*) AS n
	FROM ${F}, UNNEST(${col}) AS x
	WHERE ${WORKING} AND x IS NOT NULL AND x != '' ${not}
	GROUP BY label ORDER BY n DESC LIMIT ${n}`;
};
