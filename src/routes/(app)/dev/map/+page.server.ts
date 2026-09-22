import type { PageServerLoad } from './$types';

/**
 * No gate. Unlike its siblings under `dev/`, this page ships.
 *
 * It used to 404 in any production build (`if (!dev) error(404)`), which was never a
 * security measure — every route under `(app)` already requires a signed-in user, and the
 * coordinates artifact is auth-gated on its own. The gate was editorial: don't ship a page
 * of PLACEHOLDER copy.
 *
 * It is unlisted rather than promoted: nothing in the nav points here, and the only way in
 * is Explore's "Map" link, which carries the scope you built there. Signed-in users can
 * therefore find it, which is the accepted trade — the alternative was removing that link,
 * and the link is what makes this a second view of your set rather than a separate page.
 *
 * The `/dev` in the path is now only a path. `MAP_PATH` in `$lib/map/route.ts` is the single
 * place to change it when this is promoted properly.
 */
export const load: PageServerLoad = () => {};
