/**
 * Read the catalog artifact pointer from GCS and hand the browser a signed URL for it.
 *
 * The artifact is built by `scripts/build-catalog-artifact.ts` in CI and stored under a
 * content-hashed name, with `catalog-current.json` naming the current hash. This module is
 * the read side: resolve the pointer, sign a URL, let the browser fetch the bytes straight
 * from GCS. The Cloud Run process never holds the 5.25 MB.
 *
 * The auth gate does not live here — `/api/catalog` still checks `locals.user` before
 * calling any of this. The bucket is private; a signed URL is the only way in.
 */
import { Storage } from '@google-cloud/storage';
import { env } from '$env/dynamic/private';

export interface CatalogPointer {
	hash: string;
	name: string;
	builtAt: string;
	rows: number;
	bytes: number;
}

const POINTER = 'catalog-current.json';

/**
 * How long a signed URL lives, and — far more importantly — how long the *same* URL string
 * is handed out. See `windowStart` below.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRY_MS = 48 * 60 * 60 * 1000;

/** The pointer is tiny but must not be read on every request. */
const POINTER_TTL_MS = 60_000;

let pointerCache: { at: number; value: CatalogPointer } | null = null;
let storage: Storage | null = null;

const project = () => env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const bucketName = () => env.CATALOG_BUCKET || `${project()}-bgg-viewer-artifacts`;
const bucket = () => (storage ??= new Storage({ projectId: project() })).bucket(bucketName());

/**
 * Floor to a fixed 24h boundary rather than using `now`.
 *
 * This is the difference between the browser caching the artifact and re-downloading 5.25 MB
 * on every visit. A signed URL generated as `now + 24h` produces a DIFFERENT URL string on
 * every request, so the browser can never match its cache entry — which would be strictly
 * worse than the endpoint this replaces, while looking like it works. Anchoring both the
 * signing window and the expiry to a fixed boundary makes the string identical for every
 * request in that window, and identical across containers, so the cache actually hits.
 */
const windowStart = (now: number) => Math.floor(now / WINDOW_MS) * WINDOW_MS;

/** Read (and briefly cache) the pointer object. */
export async function getCatalogPointer(
	clock: () => number = Date.now,
	read?: () => Promise<Buffer>
): Promise<CatalogPointer> {
	const doRead = read ?? (async () => (await bucket().file(POINTER).download())[0]);
	if (pointerCache && clock() - pointerCache.at < POINTER_TTL_MS) return pointerCache.value;
	const value = JSON.parse((await doRead()).toString('utf-8')) as CatalogPointer;
	pointerCache = { at: clock(), value };
	return value;
}

export interface SignedCatalog {
	url: string;
	hash: string;
	builtAt: string;
	/** True when the artifact is old enough that the build pipeline has probably stopped firing. */
	stale: boolean;
}

/**
 * Resolve the pointer and sign a URL for the artifact it names.
 *
 * v2 signing, deliberately, not v4. A v4 URL embeds `X-Goog-Date` — the moment of signing —
 * so its string changes on every call even when the expiry is pinned, which would defeat the
 * whole caching argument above. A v2 URL carries only the absolute `Expires`, so with a
 * window-anchored expiry the output is byte-identical for every request in the window,
 * whichever container serves it.
 */
export async function getSignedCatalog(
	clock: () => number = Date.now,
	sign: (name: string, expires: number) => Promise<string> = async (name, expires) =>
		(await bucket().file(name).getSignedUrl({ version: 'v2', action: 'read', expires }))[0],
	read?: () => Promise<Buffer>
): Promise<SignedCatalog> {
	const pointer = await getCatalogPointer(clock, read);
	const expires = windowStart(clock()) + EXPIRY_MS;
	const url = await sign(pointer.name, expires);

	/**
	 * The failure mode this design introduces. The old TTL always self-healed: worst case a
	 * user waited for a rebuild and got fresh data. An event-triggered build can simply not
	 * fire — the dispatch fails, the PAT expires — and nothing else would ever notice, because
	 * serving a stale artifact looks exactly like serving a fresh one. 36h covers a missed
	 * daily run plus slack.
	 */
	const stale = clock() - Date.parse(pointer.builtAt) > 36 * 60 * 60 * 1000;
	if (stale) {
		console.warn(
			`[catalog] artifact is stale — built ${pointer.builtAt}, no refresh since. ` +
				'The pipeline dispatch may have stopped firing.'
		);
	}

	return { url, hash: pointer.hash, builtAt: pointer.builtAt, stale };
}

/** Test seam. */
export function _resetPointerCache(): void {
	pointerCache = null;
}
