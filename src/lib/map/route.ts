/**
 * The join between Explore and the map.
 *
 * Both surfaces read the *same* `Scope` from the querystring, so moving between them is not
 * a handoff with its own format — it is the same state object rendered two ways. That is
 * what stops the map being an island: you filter in Explore, follow the link, and the map
 * opens on the set you built, lit against the whole landscape; come back and your filters
 * are intact.
 *
 * The map adds its own encoding params (projection, colour, size) on top, which Explore
 * ignores and preserves is not required to — they are round-tripped through this module so a
 * there-and-back trip doesn't quietly reset how the map was drawn.
 */
import { scopeToParams, scopeFromParams, type Scope } from '$lib/catalog/scope';
import { toParams as viewToParams, fromParams as viewFromParams, type ViewState } from './view';

export const MAP_PATH = '/map';
export const EXPLORE_PATH = '/games';

/** Which of the querystring's params belong to the map's *encodings* rather than the scope. */
const VIEW_KEYS = ['p', 'x', 'y', 'c', 's'] as const;

/**
 * The map's URL for a scope — the "see this on the map" link.
 *
 * `view` is optional: passing the current encodings keeps them across the trip, omitting it
 * opens the map however it opens by default.
 */
export function mapHref(scope: Scope, view?: ViewState): string {
	const params = scopeToParams(scope);
	if (view) {
		for (const [k, v] of viewToParams(view)) {
			if ((VIEW_KEYS as readonly string[]).includes(k)) params.set(k, v);
		}
	}
	const qs = params.toString();
	return qs ? `${MAP_PATH}?${qs}` : MAP_PATH;
}

/**
 * Explore's URL for a scope — the way back.
 *
 * The map's encoding params are deliberately dropped: they mean nothing to a list, and
 * carrying them would leave junk in the URL of a page that cannot act on it.
 */
export function exploreHref(scope: Scope): string {
	const qs = scopeToParams(scope).toString();
	return qs ? `${EXPLORE_PATH}?${qs}` : EXPLORE_PATH;
}

/** Read both halves of the map's state out of one querystring. */
export function readMapUrl(params: URLSearchParams, k: number): { scope: Scope; view: ViewState } {
	return { scope: scopeFromParams(params), view: viewFromParams(params, k) };
}

/**
 * Serialize both halves back into one querystring.
 *
 * Scope first, then the encodings — so the shareable, meaningful part of the URL reads first
 * and the map's own knobs trail it.
 */
export function writeMapUrl(scope: Scope, view: ViewState): string {
	const params = scopeToParams(scope);
	for (const [key, value] of viewToParams(view)) params.set(key, value);
	return params.toString();
}
