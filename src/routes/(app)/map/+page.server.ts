import type { PageServerLoad } from './$types';

/**
 * No gate — every route under `(app)` already requires a signed-in user, and the coordinates
 * artifact is auth-gated on its own.
 *
 * Linked from the nav's Tools menu, and from Explore's "Map" link, which carries the scope
 * you built there. It used to live unlisted at `/dev/map`; that path now redirects here.
 * `MAP_PATH` in `$lib/map/route.ts` is the single place the path is spelled.
 */
export const load: PageServerLoad = () => {};
