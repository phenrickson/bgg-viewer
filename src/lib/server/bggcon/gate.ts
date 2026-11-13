/**
 * BGG.CON routes are open to any signed-in user (Phil, 2026-11-12; each user has their own
 * stars). Server endpoints don't inherit the `(app)` layout guard, so every route calls this.
 */
import { error } from '@sveltejs/kit';
import type { SessionUser } from '../auth/session';

export function requireUser(user: SessionUser | null | undefined): SessionUser {
	if (!user) throw error(401, 'Sign in required.');
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
