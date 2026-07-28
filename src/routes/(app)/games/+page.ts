// The Explore workspace runs entirely in the browser (DuckDB-WASM over the catalog
// artifact), so opt out of SSR. The `(app)` layout guard (server load) still applies.
export const ssr = false;
