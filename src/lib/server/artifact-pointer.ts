/**
 * Read an artifact's pointer from GCS and hand the browser a signed URL for the object it
 * names. The read side of the CI-built artifact rail.
 *
 * Extracted from `catalog/gcs.ts` once thumbnails needed the identical shape — the same
 * split, and for the same reason, as `artifact-cache.ts` next door. **A factory, not a
 * module of functions:** `pointerCache` must be per-artifact. Two artifacts sharing one
 * cache would mean whichever resolved first won the next 60 seconds, and the other would be
 * handed the wrong hash and sign a URL for the wrong object — which fails as a 404 at best
 * and as the wrong bytes loaded into the right DuckDB table at worst.
 *
 * The `Storage` client is deliberately NOT per-instance: it holds no per-artifact state and
 * every artifact lives in the same bucket, so one is enough.
 *
 * The auth gate does not live here — each `/api/*` endpoint checks `locals.user` before
 * calling any of this. The bucket is private; a signed URL is the only way in.
 */
import { Storage } from '@google-cloud/storage';
import { env } from '$env/dynamic/private';

export interface ArtifactPointer {
	hash: string;
	name: string;
	builtAt: string;
	rows: number;
	bytes: number;
}

export interface SignedArtifact {
	url: string;
	hash: string;
	builtAt: string;
	/** True when the artifact is old enough that the build pipeline has probably stopped firing. */
	stale: boolean;
}

/**
 * How long a signed URL lives, and — far more importantly — how long the *same* URL string
 * is handed out. See `windowStart` below.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPIRY_MS = 48 * 60 * 60 * 1000;

/** The pointer is tiny but must not be read on every request. */
const POINTER_TTL_MS = 60_000;

/** A missed daily run plus slack. See the staleness block in `getSignedArtifact`. */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

let storage: Storage | null = null;

const project = () => env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const bucketName = () => env.CATALOG_BUCKET || `${project()}-bgg-viewer-artifacts`;
const bucket = () => (storage ??= new Storage({ projectId: project() })).bucket(bucketName());

/**
 * Floor to a fixed 24h boundary rather than using `now`.
 *
 * This is the difference between the browser caching the artifact and re-downloading it on
 * every visit. A signed URL generated as `now + 24h` produces a DIFFERENT URL string on
 * every request, so the browser can never match its cache entry — which would be strictly
 * worse than the endpoint this replaces, while looking like it works. Anchoring both the
 * signing window and the expiry to a fixed boundary makes the string identical for every
 * request in that window, and identical across containers, so the cache actually hits.
 */
const windowStart = (now: number) => Math.floor(now / WINDOW_MS) * WINDOW_MS;

export interface ArtifactPointerOptions {
	/** Object name of the pointer JSON, e.g. `catalog-current.json`. */
	pointerName: string;
	/** Name used in the staleness warning, e.g. "catalog" or "thumbnails". */
	label: string;
}

/** One instance per artifact — each gets its own pointer cache. */
export function createArtifactPointer({ pointerName, label }: ArtifactPointerOptions) {
	let pointerCache: { at: number; value: ArtifactPointer } | null = null;

	/** Read (and briefly cache) the pointer object. */
	async function getPointer(
		clock: () => number = Date.now,
		read?: () => Promise<Buffer>
	): Promise<ArtifactPointer> {
		const doRead = read ?? (async () => (await bucket().file(pointerName).download())[0]);
		if (pointerCache && clock() - pointerCache.at < POINTER_TTL_MS) return pointerCache.value;
		const value = JSON.parse((await doRead()).toString('utf-8')) as ArtifactPointer;
		pointerCache = { at: clock(), value };
		return value;
	}

	/**
	 * Resolve the pointer and sign a URL for the artifact it names.
	 *
	 * v2 signing, deliberately, not v4. A v4 URL embeds `X-Goog-Date` — the moment of
	 * signing — so its string changes on every call even when the expiry is pinned, which
	 * would defeat the whole caching argument above. A v2 URL carries only the absolute
	 * `Expires`, so with a window-anchored expiry the output is byte-identical for every
	 * request in the window, whichever container serves it.
	 */
	async function getSignedArtifact(
		clock: () => number = Date.now,
		sign: (name: string, expires: number) => Promise<string> = async (name, expires) =>
			(await bucket().file(name).getSignedUrl({ version: 'v2', action: 'read', expires }))[0],
		read?: () => Promise<Buffer>
	): Promise<SignedArtifact> {
		const pointer = await getPointer(clock, read);
		const expires = windowStart(clock()) + EXPIRY_MS;
		const url = await sign(pointer.name, expires);

		/**
		 * The failure mode this design introduces. The old TTL always self-healed: worst case
		 * a user waited for a rebuild and got fresh data. An event-triggered build can simply
		 * not fire — the dispatch fails, the PAT expires — and nothing else would ever notice,
		 * because serving a stale artifact looks exactly like serving a fresh one.
		 */
		const stale = clock() - Date.parse(pointer.builtAt) > STALE_AFTER_MS;
		if (stale) {
			console.warn(
				`[${label}] artifact is stale — built ${pointer.builtAt}, no refresh since. ` +
					'The pipeline dispatch may have stopped firing.'
			);
		}

		return { url, hash: pointer.hash, builtAt: pointer.builtAt, stale };
	}

	/** Test seam. */
	function reset(): void {
		pointerCache = null;
	}

	return { getPointer, getSignedArtifact, reset };
}
