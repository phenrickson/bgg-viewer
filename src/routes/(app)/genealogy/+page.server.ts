import type { PageServerLoad } from './$types';

/**
 * No gate: every route under `(app)` already requires a signed-in user, and the vectors and
 * coordinates artifacts it reads are auth-gated on their own.
 *
 * Linked from the nav's Tools menu. It ran at `/dev/genealogy` as a prototype; that path now
 * redirects here.
 */
export const load: PageServerLoad = () => {};
