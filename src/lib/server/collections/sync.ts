/**
 * Fire-and-forget sync trigger for self-serve collection linking. Checks whether a username's
 * collection is missing or stale via the existing (Phase 1) reader, and if so, calls the
 * gated bgg-collection-scoring service's `/sync/{username}`. Never throws — a failed sync is
 * logged, not surfaced to the caller, since registration/login must never block or fail on it.
 */
import { env } from '$env/dynamic/private';
import { getGatedServiceIdToken } from '$lib/server/warehouse/token';
import { fetchOwnedCollection } from './read';

/** Conservative first cut — see docs/superpowers/specs/2026-08-26-collection-filter-design.md. */
const STALE_MS = 24 * 60 * 60 * 1000;

function isStale(updatedAt: string | null): boolean {
	if (!updatedAt) return true;
	return Date.now() - new Date(updatedAt).getTime() > STALE_MS;
}

function requireAudience(): string | null {
	const audience = env.COLLECTION_SYNC_SERVICE_URL;
	if (!audience) {
		console.error('COLLECTION_SYNC_SERVICE_URL is not set — skipping collection sync trigger.');
		return null;
	}
	return audience.replace(/\/+$/, '');
}

/**
 * Fetch a fresh collection for `username`. By default, skips the call if what's already
 * synced is neither missing nor stale — pass `force: true` for an explicit user-initiated
 * refresh (the settings page's "Refresh now"), which should always hit the service.
 *
 * Returns whether a sync was actually attempted and succeeded — `false` covers both "skipped,
 * already fresh" and "attempted, failed", since callers that only fire-and-forget (registration,
 * settings-save) ignore the return value entirely and everything here still never throws.
 */
export async function triggerSync(username: string, opts: { force?: boolean } = {}): Promise<boolean> {
	const audience = requireAudience();
	if (!audience) return false;

	try {
		if (!opts.force) {
			const existing = await fetchOwnedCollection(username);
			if (existing.game_ids.length > 0 && !isStale(existing.updated_at)) return false;
		}

		const token = await getGatedServiceIdToken(audience, env.COLLECTION_SYNC_ID_TOKEN);
		const res = await fetch(`${audience}/sync/${encodeURIComponent(username)}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) {
			console.error(`Collection sync failed for '${username}' (${res.status})`);
			return false;
		}
		return true;
	} catch (e) {
		console.error(`Collection sync trigger threw for ${username}`, e);
		return false;
	}
}
