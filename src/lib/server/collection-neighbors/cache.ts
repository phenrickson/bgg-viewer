/**
 * PROTOTYPE: where the local build writes each collection's artifact, and where
 * `/api/collection-neighbors` reads it. Production puts these on the GCS rail (one
 * content-hashed object + pointer per username) like the catalog.
 */
import path from 'node:path';

export const CACHE_DIR = '.cache/collection-neighbors';

/** Usernames are BGG handles; keep the filename to a safe character set. */
export function cachePath(username: string): string {
	const safe = username.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
	return path.join(CACHE_DIR, `${safe}.arrow`);
}
