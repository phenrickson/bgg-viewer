/**
 * One number for the landing hero: how many games are in the catalog right now.
 *
 * From the GCS pointer, not `content.json`. The baked `stats.games` is a snapshot from
 * whenever the landing content was last generated, and the catalog gains games every day —
 * the two had visibly disagreed on the same page a few seconds apart. The pointer is written
 * by every catalog build and is already cached in-process for a minute, so this is one cheap
 * read per minute, not one per visitor.
 *
 * A logged-out visitor sees this too. It is a count, not the catalog; nothing gated leaks.
 * If GCS is unreachable the baked figure is the fallback — a stale number beats no number
 * on a page whose job is to say what this is.
 */
import { getCatalogPointer } from '$lib/server/catalog/gcs';
import { landingContent } from '$lib/landing/content';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const { rows } = await getCatalogPointer();
		return { gameCount: rows };
	} catch {
		return { gameCount: landingContent.stats.games };
	}
};
