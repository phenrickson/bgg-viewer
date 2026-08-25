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
const notIn = (names) => `name NOT IN (${names.map((n) => `'${n.replace(/'/g, "''")}'`).join(', ')})`;
const in_ = (names) => `name IN (${names.map((n) => `'${n.replace(/'/g, "''")}'`).join(', ')})`;

/**
 * `exclude` keeps specific games out of the pool `label()` picks from — for a game that keeps
 * winning its x-bucket by raw popularity but isn't the one you want naming that part of the
 * axis (see `08-popularity-vs-rating.viz.js`'s `opts.exclude`). The other 249 slots still fill
 * normally; this only removes candidates, it doesn't choose replacements.
 */
export const notable = (cols, where, exclude = []) => `
	SELECT ${cols}, name, users_rated AS pop FROM ${F}
	WHERE ${WORKING} AND ${where} ${exclude.length ? `AND ${notIn(exclude)}` : ''}
	ORDER BY users_rated DESC LIMIT 250`;

/**
 * Named games to force-include, by exact title — for when a SPECIFIC game should always be
 * labelled (see `08-popularity-vs-rating.viz.js`'s `opts.highlights`), on top of whatever
 * `label()` still picks automatically for the remaining slots. Not filtered by `where`: a viz
 * naming a game explicitly has already decided it belongs, and it silently vanishing because
 * it fell just outside the plot's own filter would be confusing.
 * Named `pinned` rather than `named` — `scatter()` below already uses `named` as its
 * notable-rows parameter, and shadowing that with the query builder invited exactly the kind
 * of mix-up this comment is now preventing.
 */
export const pinned = (cols, names) => `
	SELECT ${cols}, name FROM ${F}
	WHERE ${WORKING} AND ${in_(names)}`;

/**
 * Pick the games to name on a cloud.
 *
 * Spread across the x range, not simply the most popular: taking the top N by ratings labels
 * six games in one corner and leaves the rest of the plot anonymous, which teaches nothing
 * about the axis. Bucketing by x and taking the best-known game in each means the labels
 * describe the whole span.
 *
 * `xLog` must match the axis the viz actually renders on, because the buckets have to be cut
 * in the space the reader sees. Bucketing a log axis linearly collapses the plot: playtime
 * spans 1-4320 minutes, so six LINEAR buckets put everything under 721 minutes — about 99% of
 * the games, and 70% of them sit under 65 — into bucket 0, leaving the other five to fight
 * over a sparse tail. The result was four labels instead of six, all of them bunched in the
 * thin end of the axis where the data isn't.
 */
export const label = (rows, n = 6, xLog = false) => {
	const usable = rows.filter((r) => r.name && r.x != null && r.y != null);
	if (!usable.length) return [];
	const tx = xLog ? (v) => Math.log10(Math.max(1, v)) : (v) => v;
	const xs = usable.map((r) => tx(Number(r.x)));
	const lo = Math.min(...xs);
	const hi = Math.max(...xs);
	if (hi === lo) return [];

	const buckets = new Map();
	for (const r of usable) {
		const b = Math.min(n - 1, Math.floor(((tx(Number(r.x)) - lo) / (hi - lo)) * n));
		const cur = buckets.get(b);
		if (!cur || Number(r.pop) > Number(cur.pop)) buckets.set(b, r);
	}
	return [...buckets.values()]
		.sort((a, b) => Number(a.x) - Number(b.x))
		.map((r) => ({ x: Number(r.x), y: Number(r.y), label: r.name }));
};

/**
 * Like `label()`, but groups candidates by an explicit key instead of bucketing by x
 * POSITION — for when the visual x (possibly jittered, like a decade-jitter plot's) doesn't
 * cleanly divide into the categories you actually want named. A candidate near a bucket edge
 * under `label()`'s x-range split can land in the neighbor's bucket; grouping by an exact key
 * pulled straight off the row (e.g. a `decade` column the query selected alongside `x`) has no
 * such edge case.
 */
export const labelByGroup = (rows, groupKey, perGroup = 1) => {
	const usable = rows.filter((r) => r.name && r.x != null && r.y != null);
	const byGroup = new Map();
	for (const r of usable) {
		const g = groupKey(r);
		if (!byGroup.has(g)) byGroup.set(g, []);
		byGroup.get(g).push(r);
	}
	const out = [];
	for (const group of byGroup.values()) {
		group.sort((a, b) => Number(b.pop) - Number(a.pop));
		for (const r of group.slice(0, perGroup)) {
			out.push({ x: Number(r.x), y: Number(r.y), label: r.name });
		}
	}
	return out.sort((a, b) => a.x - b.x);
};

/** Default target annotation count — `label()`'s own default, pulled out so `scatter()` can
 *  reserve slots from the same number when `opts.highlights` forces some in. */
const LABEL_COUNT = 6;

export const scatter = (title, note, xLabel, yLabel, [rows, named, forcedRows], opts = {}) => {
	const { groupKey, perGroup, highlights, exclude, ...rest } = opts;

	// `highlights` force these specific games onto the chart, on top of — not instead of —
	// whatever `label()` still picks for the rest. `exclude` (see `notable()`) is how a game
	// that keeps auto-winning a bucket gets removed from consideration; the two together are
	// how a viz does a targeted swap (drop this game, add that one) without hand-writing the
	// whole annotation list.
	const forced = (forcedRows ?? [])
		.filter((r) => r.name && r.x != null && r.y != null)
		.map((r) => ({ x: Number(r.x), y: Number(r.y), label: r.name }));
	const forcedNames = new Set(forced.map((f) => f.label));

	const autoSlots = Math.max(0, LABEL_COUNT - forced.length);
	const auto = groupKey
		? labelByGroup(named, groupKey, perGroup ?? 2)
		: label(named, autoSlots, rest.xLog ?? false);
	// A forced game could also legitimately win its own bucket under `label()` — dedupe rather
	// than show it twice.
	const annotations = [...forced, ...auto.filter((a) => !forcedNames.has(a.label))].sort(
		(a, b) => a.x - b.x
	);

	return {
		kind: 'scatter',
		title,
		note,
		xLabel,
		yLabel,
		points: rows.map((r) => [Number(r.x), Number(r.y)]),
		annotations,
		...rest
	};
};

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
 * Overlapping KDE density curves ("ridgeline"/joyplot), one lane per group in `order`. `rows`
 * are RAW `{label, x}` pairs — one row per data point, no discretization. An earlier version
 * bucketed into a histogram first and smoothed the result; at these group sizes (a few hundred
 * points spread across a few dozen bins) that averages out to single-digit counts per bin, so
 * what it actually drew was sampling noise, not a density. A real Gaussian KDE reads every
 * point directly.
 *
 * Bandwidth is Silverman's rule of thumb (`1.06 * stdev * n^-0.2`) — the standard default when
 * there's no reason to hand-tune it per group. Evaluated on ONE shared grid across every lane
 * (so lanes overlay on one x-axis without per-lane interpolation in the renderer). No separate
 * per-lane normalization is needed the way the histogram version required — a KDE integrates
 * to 1 by construction (dividing by `n` is part of the formula, not a separate step), so a
 * bigger group naturally produces a more RELIABLE curve rather than a taller one; comparing
 * shape rather than volume falls out of using a real density estimate instead of raw counts.
 *
 * Bandwidth is HALF of Silverman's rule of thumb, not the full thing. Checked against real
 * data (GMT Games: n=347, sd=0.6, full Silverman h=0.198 against a 3.72-point span) — that's
 * not an unreasonable bandwidth by general KDE standards, but Silverman's rule assumes the
 * underlying distribution is roughly bell-shaped, and rating distributions usually aren't
 * (skewed, sometimes multiple bumps), so it over-smooths and erases real texture. Halving it
 * is a standard practical correction for exactly this case.
 */
export const ridge = (title, note, xLabel, yLabel, rows, order, precision = 1, gridSize = 120) => {
	const byLabel = new Map();
	for (const r of rows) {
		const label = String(r.label);
		if (!byLabel.has(label)) byLabel.set(label, []);
		byLabel.get(label).push(Number(r.x));
	}

	const allX = rows.map((r) => Number(r.x));
	const dataLo = Math.min(...allX);
	const dataHi = Math.max(...allX);
	// Padded so a lane's curve doesn't get chopped off right at the data's own extreme — same
	// reasoning as Scatter's domain padding.
	const pad = (dataHi - dataLo) * 0.08 || 0.5;
	const gridLo = dataLo - pad;
	const gridHi = dataHi + pad;
	const grid = [];
	for (let i = 0; i < gridSize; i++) grid.push(gridLo + ((gridHi - gridLo) * i) / (gridSize - 1));

	const gaussian = (u) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);

	const lanes = order.map((label) => {
		const values = (byLabel.get(label) ?? []).slice().sort((a, b) => a - b);
		const n = values.length;
		if (n === 0) return { label, n: 0, density: grid.map(() => 0), median: 0 };

		const mean = values.reduce((s, v) => s + v, 0) / n;
		const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
		const h = 0.5 * 1.06 * Math.sqrt(variance || 1e-6) * Math.pow(n, -0.2);

		const density = grid.map((x) => {
			let sum = 0;
			for (const v of values) sum += gaussian((x - v) / h);
			return sum / (n * h);
		});

		const median = n % 2 === 1 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
		return { label, n, density, median: Number(median.toFixed(3)) };
	});

	// Trim leading/trailing grid points where the POOLED density (every lane's actual count
	// summed together) is negligible — a handful of outlier games in just one or two lanes can
	// otherwise drag the shared axis out to cover a range that's visually empty for every lane.
	const pooled = grid.map((_, i) => lanes.reduce((s, l) => s + l.density[i] * l.n, 0));
	const grandTotal = pooled.reduce((s, c) => s + c, 0);
	const tailBudget = grandTotal * 0.01; // 1% of the pooled total per tail
	let start = 0;
	let cum = 0;
	while (start < pooled.length - 1 && cum + pooled[start] < tailBudget) {
		cum += pooled[start];
		start++;
	}
	let end = pooled.length - 1;
	cum = 0;
	while (end > start && cum + pooled[end] < tailBudget) {
		cum += pooled[end];
		end--;
	}

	return {
		kind: 'ridge',
		title,
		note,
		xLabel,
		yLabel,
		precision,
		grid: grid.slice(start, end + 1).map((v) => Number(v.toFixed(3))),
		lanes: lanes.map((l) => ({
			label: l.label,
			n: l.n,
			median: l.median,
			density: l.density.slice(start, end + 1)
		}))
	};
};

/**
 * The cloud and its labels, fetched together — they always come as a pair. `n` overrides the
 * default sample size (see `SAMPLE`). `opts.exclude`/`opts.highlights` (see `notable()`/
 * `pinned()`) shape the auto-pick pool and add a forced-include query respectively; the forced
 * query only runs when `highlights` is actually set, so a viz using neither pays for one query,
 * same as before either option existed.
 */
export const pair = (cols, where, n, opts = {}) => {
	const { exclude, highlights } = opts;
	return Promise.all([
		q(sample(cols, where, n)),
		q(notable(cols, where, exclude)),
		highlights?.length ? q(pinned(cols, highlights)) : []
	]);
};

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
