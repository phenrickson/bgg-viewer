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

The plotted sample is 500 points, stratified across the rating range (see
`sample()` in `lib.js`), plus up to 6 named annotations picked from the most
popular games spread across the x range (see `notable()`/`label()`). You
don't write either query yourself — `cols`/`where` drive both.

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
  string column (mechanics, categories, designers).

## Shared helpers (`lib.js`)

`F` (the games table, fully qualified), `WORKING` (the working-set filter),
`q()` (run arbitrary SQL), `pair()` (the scatter sample + its notable-games
query, run together), `topOf()` (top-N of a repeated column), and the
`scatter()`/`columns()`/`bars()` builders that turn query rows into the
`Viz` shape `build-landing-content.js` writes to `content.json`. You
shouldn't need to touch any of this to add a viz — it's what the fields
above drive.

## Removing a viz

Delete the file. Re-run `pnpm landing:content`.
