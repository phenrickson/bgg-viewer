/**
 * Who may read (or sync) a BGG username's collection: its own linked account, or the admin.
 * One rule for every endpoint that reads a username's collection (`/api/collection`), so the
 * copies can't drift. Syncing one (`/api/collection/sync`) is stricter: admin only.
 */
import { isAdmin } from './admin';
import type { SessionUser } from './session';

export function canReadCollection(user: SessionUser | null | undefined, username: string): boolean {
	if (!user) return false;
	if (isAdmin(user)) return true;
	return user.bgg_username != null && user.bgg_username === username;
}
