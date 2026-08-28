/**
 * Mints Google-signed ID tokens for the gated warehouse Cloud Run service.
 *
 * In production (on Cloud Run) and with service-account ADC, `google-auth-library`
 * fetches a token whose audience is the service URL — exactly what Cloud Run's IAM
 * gate checks. The `IdTokenClient` is cached per audience so we're not re-negotiating
 * credentials on every request.
 *
 * Local dev runs on a *user* ADC identity, which can't mint a token this way — but
 * the warehouse gate accepts your `gcloud` identity token directly (verified: 403
 * unauth, 200 with it). So in dev we shell out to `gcloud auth print-identity-token`
 * and cache the result (tokens last ~1h). `WAREHOUSE_ID_TOKEN` still overrides both
 * paths as a manual escape hatch.
 */
import { GoogleAuth, type IdTokenClient } from 'google-auth-library';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

const execAsync = promisify(exec);

let auth: GoogleAuth | null = null;
const clients = new Map<string, IdTokenClient>();

// Dev only: cache the gcloud token well within its ~1h lifetime to avoid spawning
// a process on every request.
const GCLOUD_TOKEN_TTL_MS = 50 * 60 * 1000;
let gcloudToken: { value: string; expires: number } | null = null;

async function gcloudIdToken(): Promise<string> {
	if (gcloudToken && gcloudToken.expires > Date.now()) return gcloudToken.value;
	const { stdout } = await execAsync('gcloud auth print-identity-token');
	const value = stdout.trim();
	if (!value) throw new Error('gcloud returned an empty identity token — is `gcloud` logged in?');
	gcloudToken = { value, expires: Date.now() + GCLOUD_TOKEN_TTL_MS };
	return value;
}

function requireAudience(): string {
	const audience = env.WAREHOUSE_API_URL;
	if (!audience) throw new Error('WAREHOUSE_API_URL is not set — cannot mint an ID token.');
	return audience.replace(/\/+$/, '');
}

/** Fetch (and cache the client for) a Google-signed ID token for `audience`. */
export async function mintIdToken(audience: string): Promise<string> {
	auth ??= new GoogleAuth();
	let client = clients.get(audience);
	if (!client) {
		client = await auth.getIdTokenClient(audience);
		clients.set(audience, client);
	}
	return client.idTokenProvider.fetchIdToken(audience);
}

/**
 * Returns a Bearer ID token for `audience`, honoring an override value and dev's gcloud
 * fallback — the same dance `getWarehouseIdToken` does, generalized for any gated Cloud Run
 * service this app calls (e.g. the collection-sync service in
 * `src/lib/server/collections/sync.ts`).
 */
export async function getGatedServiceIdToken(
	audience: string,
	overrideValue?: string
): Promise<string> {
	if (overrideValue) return overrideValue;
	if (dev) return gcloudIdToken();
	return mintIdToken(audience);
}

/** Returns a Bearer ID token for the warehouse audience (`WAREHOUSE_API_URL`). */
export async function getWarehouseIdToken(): Promise<string> {
	return getGatedServiceIdToken(requireAudience(), env.WAREHOUSE_ID_TOKEN);
}

/** Test seam: drop cached credentials so a fresh audience/mock is picked up. */
export function _resetTokenCache(): void {
	auth = null;
	clients.clear();
	gcloudToken = null;
}
