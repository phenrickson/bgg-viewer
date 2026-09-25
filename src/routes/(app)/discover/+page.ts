// Discover runs entirely in the browser (DuckDB-WASM over the catalog artifact), so opt out
// of SSR — same as Explore. The `(app)` layout guard (server load) still applies.
export const ssr = false;
