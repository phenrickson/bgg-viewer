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
  rows for you (see `03-mechanics-over-time.viz.js`).
- Capped at 5 series in practice — `VizOfTheDay` cycles through the app's 5
  categorical `--chart-N` tokens and repeats past that, so a 6th series
  would share a color with the 1st.
- Prefer a **share** (percent of that x's total), not a raw count, whenever
  the underlying total itself is changing over the period — otherwise "this
  grew" and "everything grew" are indistinguishable in the chart.

**`stack`** — 100%-stacked vertical bars over a continuous axis (typically
year), one bar per x-point normalized to its own total. Same `query` shape
as `line` (`series`, `x`, `y` — one row per series/x-point, pivoted the same
way), same 5-series cap.

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

## Shared helpers (`lib.js`)

`F` (the games table, fully qualified), `WORKING` (the working-set filter),
`q()` (run arbitrary SQL), `pair()` (the scatter sample + its notable-games
query, run together), `topOf()` (top-N of a repeated column), and the
`scatter()`/`columns()`/`bars()`/`line()`/`stack()` builders that turn query rows into
the `Viz` shape `build-landing-content.js` writes to `content.json`. You
shouldn't need to touch any of this to add a viz — it's what the fields
above drive.

## Removing a viz

Delete the file. Re-run `pnpm landing:content`.
