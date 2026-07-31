/**
 * Offline mode — a deliberate local switch, not failure detection.
 *
 * The use case is a laptop with no connectivity: the catalog is served from a disk cache
 * and the game profile is answered from the copy already loaded in the browser, so no
 * request reaches BigQuery or the warehouse. You turn this on knowing you're about to
 * lose the network; it is not a timeout you recover from.
 *
 * Dev-only by construction. `dev` is compile-time in SvelteKit, so a production build
 * cannot enter offline mode however OFFLINE is set in its environment.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/** Truthy spellings accepted for OFFLINE, so `1`, `true`, and `yes` all work. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export function isOffline(): boolean {
	return dev && TRUTHY.has((env.OFFLINE ?? '').trim().toLowerCase());
}
