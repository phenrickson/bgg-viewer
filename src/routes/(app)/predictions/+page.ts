// Predictions runs entirely in the browser (DuckDB-WASM over the catalog artifact), so opt
// out of SSR — same as Explore and Discover. The `(app)` layout guard (server load) still
// applies. No new artifact is needed: the catalog's working set is
// `users_rated >= 30 OR year_published >= CURRENT_YEAR`, so every upcoming game is already
// in it, carrying all five model columns.
export const ssr = false;
