/**
 * Fetch an artifact's bytes from an `/api/*` endpoint, whichever shape it answers in.
 *
 * The artifact endpoints return one of two things: a signed GCS URL as JSON, so the bytes
 * travel from GCS straight to the browser without passing through Cloud Run, or the Arrow
 * stream itself. Both shapes are live at once, on purpose — a fresh bucket before the first
 * pipeline run, GCS unreachable, offline mode, or a `*_SOURCE=bigquery` escape hatch all
 * fall back to the second — so handling both here is what lets client and server deploy in
 * either order, and either one roll back alone.
 *
 * The gzipped object is served with `content-encoding: gzip`, which the browser decompresses
 * transparently, so the caller gets plain Arrow IPC bytes either way.
 */

/** Fetch `endpoint` and return the artifact's Arrow IPC bytes. */
export async function fetchArtifactBytes(endpoint: string): Promise<Uint8Array> {
	const res = await fetch(endpoint);
	if (!res.ok) throw new Error(`${endpoint} fetch failed (${res.status})`);

	if (!res.headers.get('content-type')?.includes('application/json')) {
		return new Uint8Array(await res.arrayBuffer());
	}

	const { url } = (await res.json()) as { url: string };
	// No credentials: the signature IS the authorisation, and sending cookies cross-origin
	// to storage.googleapis.com would only invite a CORS preflight failure.
	const bytes = await fetch(url);
	if (!bytes.ok) throw new Error(`${endpoint} artifact fetch failed (${bytes.status})`);
	return new Uint8Array(await bytes.arrayBuffer());
}
