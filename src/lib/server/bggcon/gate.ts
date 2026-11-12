/**
 * BGG.CON routes are admin-only (Phase 1: just Phil). Server endpoints don't inherit the
 * `(app)` layout guard, so every route calls this itself.
 */
import { error } from '@sveltejs/kit';
import { isAdmin } from '../auth/admin';
import type { SessionUser } from '../auth/session';

export function requireAdmin(user: SessionUser | null | undefined): SessionUser {
	if (!user) throw error(401, 'Sign in required.');
	if (!isAdmin(user)) throw error(403, 'Not available.');
	return user;
}

/** `?ids=13,7865` → [13, 7865]; anything that isn't a positive integer is skipped. Null = all. */
export function parseIds(raw: string | null): number[] | null {
	if (raw == null) return null;
	return raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
}
