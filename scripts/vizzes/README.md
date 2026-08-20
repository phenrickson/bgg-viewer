# Adding a viz

Each file here is one entry in the landing page's "chart of the day"
rotation. Add a file, run the build, commit both — that's the whole process.

## Add one

1. Copy the closest existing file as a starting point (a `scatter` file for
   a cloud, `columns` for a numeric distribution, `bars` for a ranked
   category).
2. Give it a two-digit filename prefix that places it where you want it in
   the rotation order — `12-your-slug.viz.js`. Order matters: it decides
   which two vizzes land in the same landing-page slot together (see
   `rotation.ts` in `src/lib/landing/`).
3. Fill in the fields for your kind (below) and write the `note` (and
   `calloutTemplate`, for `columns`) — that's real copy, not a query detail.
4. Run `pnpm landing:content` from the repo root. It queries BigQuery,
   regenerates `src/lib/landing/content.json`, and prints a summary
   including the gzip size (budget: 60 KB).
5. Check the new chart on the landing page (`pnpm dev`) in both light and
   dark, then commit the new file and the regenerated `content.json`.

A malformed file (missing a required field, bad SQL) fails the build with
the filename in the error — nothing gets silently dropped.

## Fields by kind

Every viz needs: `id` (string, unique), `kind`, `title`, `note`, `xLabel`,
`yLabel`.

**`scatter`** — a cloud of points, e.g. one stat against another.

- `cols` — the two columns to select, aliased `x` and `y`
  (`'ROUND(average_weight,2) AS x, ROUND(average_rating,2) AS y'`).
- `where` — filter applied on top of the working-set filter (`lib.js`'s
  `WORKING`, currently `users_rated >= 30`).
- `opts` (optional) — e.g. `{ xLog: true }` for an axis spanning orders of
  magnitude (vote counts, not ratings).
- `sample` (optional) — point count, overriding `lib.js`'s default (1000).
  Bump it for a cloud that reads sparse; drop it for one that's mostly
  overplotted. Costs payload bytes, not query cost or render time (see
  below) — the 60 KB gzip budget is the only real ceiling.

The plotted sample is stratified across the rating range (see `sample()` in
`lib.js`), plus up to 6 named annotations picked from the most popular games
spread across the x range (see `notable()`/`label()`). You don't write
either query yourself — `cols`/`where`/`sample` drive both.

A bigger `sample` is close to free: the query already scans the whole
filtered table to compute its window functions before subsampling, so BQ
cost doesn't change; rendering is a non-interactive `<canvas>` draw, cheap
into the thousands of points. The only thing that actually grows is
`content.json`'s size, since `points` ships inside the JS bundle.

**`columns`** — discrete numeric buckets (a distribution, a histogram).

- `query` — full SQL returning `v` (bucket value) and `n` (count) columns.
- `tickEvery` — label every Nth bucket (by index, not value).
- `precision` — decimal places on bucket labels (`0` for years/counts, `1`
  or `2` for ratings/weights).
- `calloutTemplate` (optional) — `(v, n, pct, total) => string`, called with
  the peak bucket's own value/count/share/total. This is how the chart
  states its takeaway instead of just showing a shape — write one if the
  peak is worth calling out.

**`bars`** — a ranked list of categories (horizontal bars).

- `query` — full SQL returning `label` and `n` columns. The `topOf(col, n)`
  helper in `lib.js` covers the common case: top N values of a repeated
  string column (mechanics, categories, designers). `n` doesn't have to be
  a count — it's just "the value," so an aggregate like average rating
  works the same way (see `12-rating-by-mechanic.viz.js`).
- `style` (optional) — `'bars'` (default) or `'dots'`. Use `'dots'` for a
  value with no meaningful zero, like an average rating: bars encode
  *length from zero*, so a metric that only spans a half-point band renders
  as a dozen nearly-identical-length bars. `'dots'` positions each value on
  a scale zoomed to the data's own range instead, where position (not
  length) carries the comparison — see the `style` field's doc comment in
  `types.ts` for the full reasoning. Pairs naturally with a top-N-and-
  bottom-N query (see `12-rating-by-mechanic.viz.js`) rather than a bare
  top-N, since best-and-worst is what actually uses the widened scale.

**`line`** — one or more trends over a continuous axis (typically year).

- `query` — full SQL returning `series`, `x`, and `y` columns, one row per
  series/x-point. For a single-series chart, alias a literal string as
  `series` (`SELECT 'Solo / Solitaire Game' AS series, ...`); for multiple
  series, select the grouping column as `series` and the builder pivots the
  rows for you (see `16-mechanics-over-time.viz.js`).
- `opts` (optional) — e.g. `{ yPercent: true }` to append `%` to the y-axis
  gridline labels, for a chart whose `y` is already a 0-100 share rather
  than a raw count.
- Capped at 6 series in practice — `VizOfTheDay` cycles through the app's 6
  categorical `--chart-N` tokens and repeats past that, so a 7th series
  would share a color with the 1st. `checkSeriesCount` in `lib.js` throws at
  build time rather than letting this happen silently.
- Prefer a **share** (percent of that x's total), not a raw count, whenever
  the underlying total itself is changing over the period — otherwise "this
  grew" and "everything grew" are indistinguishable in the chart.

**`stack`** — 100%-stacked vertical bars over a continuous axis (typically
year), one bar per x-point normalized to its own total. Same `query` shape
as `line` (`series`, `x`, `y` — one row per series/x-point, pivoted the same
way), same 6-series cap.

- `tickEvery` (optional) — label every Nth bucket by index, same as
  `columns`. Defaults to roughly 8 labels spread across the range if unset.
- Use this instead of `line` when the story is a **part-to-whole split**
  changing over time — e.g. "what share of releases have X vs. don't." Every
  column reaches full height, so the share itself sits on a common
  position scale (easier to compare than a line's slope). The underlying
  counts (and each segment's own share) are in a hover tooltip on the bar,
  not an always-on label — with a many-column chart, a persistent label on
  every segment is clutter once height already encodes the share. If the
  story is a **trend of raw counts** (not normalized), `line` is the
  plainer choice.
- Row order controls stack order (bottom to top), not alphabetical — a
  query relying on `UNION ALL` needs an explicit `ORDER BY` (see
  `14-solo-games-over-time.viz.js`) since sub-query execution order isn't
  guaranteed otherwise.

**`range`** — a median dot plus a 25th-75th percentile whisker, one per
discrete category (e.g. player count). For a metric where the SPREAD within
each category matters, not just its center — but the categories themselves
are discrete, not points on a continuum, so `line`/`stack` (which imply
something meaningful *between* two x values) would be the wrong shape.

- `query` — full SQL returning `x`, `low`, `mid`, `high` columns, one row
  per category. `low`/`mid`/`high` are typically
  `APPROX_QUANTILES(metric, 4)[OFFSET(1|2|3)]` — see
  `17-rating-by-player-count.viz.js`.
- `precision` (optional) — decimal places for the y-axis gridlines and the
  value label above each dot. Defaults to `1`.
- This is a spread of the actual data (an interquartile range), not a
  statistical confidence interval on the mean — with a few thousand rows
  per category a true CI would be too narrow to read. Say so in the note if
  it isn't obvious from context.
- Reach for `geek_rating` and check the result before committing to it: it's
  Bayesian-shrunk toward BGG's floor (~5.5) for anything short on votes,
  and the *working set* alone is thin enough (`users_rated >= 30` still
  leaves ~44% of it under 100 votes) that every category can end up
  clustered at that floor regardless of what the category actually is —
  the same trap `10-weight-distribution.viz.js`'s `num_weights >= 5` filter
  exists to dodge, just for rating instead of weight. `average_rating` has
  no such shrinkage and is usually the more honest choice here.

**`ridge`** — overlapping distribution curves ("ridgeline"/joyplot), one
lane per named group, for comparing the SHAPE of a metric's distribution
across several groups at once. A `columns` histogram shows one group's
shape at a time; a `bars`/`dots` chart shows one number per group; `ridge`
is for when you want both the shape AND the side-by-side comparison.

- `query` — full SQL returning `label`, `bucket`, `n` columns (`bucket` is
  typically `ROUND(metric*8)/8`, an eighth-point histogram bucket — see
  `18-rating-by-publisher.viz.js`). One row per (group, bucket) pair;
  sparse is fine, a group with no games in a bucket just doesn't get a row.
- `order` — required. An array of the `label` values, in the exact
  top-to-bottom lane order you want drawn. Also the PAINT order: earlier
  entries are drawn first (further back), later ones on top (nearer) — the
  bottom lane's peaks are never hidden behind the ones above it. Not
  derived from the query, because "which order do these belong in" is
  usually an editorial call (rank by some value, alphabetical, whatever
  tells the right story), not something to infer from row order.
- `bucketWidth` (optional) — must match whatever rounding the query's
  `bucket` used. Defaults to `0.125` (the eighth-point convention above).
- `precision` (optional) — decimal places for the shared x-axis tick
  labels. Defaults to `1`.
- Each lane is normalized to ITS OWN total (a density, not a raw count) —
  a group with far more games would otherwise visually dwarf a smaller
  group's curve regardless of what their shapes actually look like, which
  defeats the point of comparing shapes rather than volumes.
- The curve is a smoothed histogram (same `curveMonotoneX` the `line` chart
  uses), not a true kernel density estimate — a reasonable approximation
  at these bucket widths and group sizes, but don't oversell it as more
  statistically rigorous than it is.
- Group selection is usually its own judgment call, same as `order` above —
  see `18-rating-by-publisher.viz.js`'s comment for why an explicit
  allowlist beat a top-N-by-volume query there (the top of the catalog by
  raw publisher volume is almost entirely regional reprint/localization
  houses, not the well-known original-content publishers a reader would
  actually recognize).

## Shared helpers (`lib.js`)

`F` (the games table, fully qualified), `WORKING` (the working-set filter),
`q()` (run arbitrary SQL), `pair()` (the scatter sample + its notable-games
query, run together), `topOf()` (top-N of a repeated column), and the
`scatter()`/`columns()`/`bars()`/`line()`/`stack()`/`range()`/`ridge()`
builders that turn query rows into the `Viz` shape `build-landing-content.js`
writes to `content.json`. You shouldn't need to touch any of this to add a
viz — it's what the fields above drive.

## Removing a viz

Delete the file. Re-run `pnpm landing:content`.
