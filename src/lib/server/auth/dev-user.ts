/**
 * The dev sign-in's user (`DEV_AUTH_EMAIL`, see hooks.server.ts): the real account with that
 * email when there is one, so a local session is you (your id, name and BGG username) rather
 * than a made-up "Dev User" that only borrowed your email (Phil, 2026-11-11).
 *
 * One `core.users` read per dev-server process and email, remembered after that. No account,
 * an inactive one, or a failed read falls back to the made-up user, so the dev server never
 * fails to sign in. Dev only: the hook calls this behind its `dev` guard.
 */
import type { SessionUser } from './session';
import type { DbUser } from './users';

type Lookup = (email: string) => Promise<DbUser | null>;

/** The made-up user the dev sign-in used before it looked anyone up. */
export function madeUpDevUser(email: string, bggUsername: string | null): SessionUser {
	return { user_id: 'dev-user', email, display_name: 'Dev User', bgg_username: bggUsername };
}

let remembered: { email: string; user: Promise<SessionUser> } | null = null;

/**
 * The account for `email`, looked up once. `bggUsername` (`DEV_BGG_USERNAME`) fills in a
 * BGG username the account hasn't linked, as it always has for the made-up user.
 */
export function devUser(email: string, bggUsername: string | null, lookup: Lookup): Promise<SessionUser> {
	if (remembered?.email === email) return remembered.user;
	const user = lookup(email)
		.then((u): SessionUser => {
			if (!u || !u.is_active) return madeUpDevUser(email, bggUsername);
			return { user_id: u.user_id, email: u.email, display_name: u.display_name, bgg_username: u.bgg_username ?? bggUsername };
		})
		.catch((e) => {
			console.warn(`[dev auth] couldn't look up ${email}, signing in as the made-up Dev User:`, e);
			return madeUpDevUser(email, bggUsername);
		});
	remembered = { email, user };
	return user;
}

/** For tests: forget the remembered user. */
export function forgetDevUser(): void {
	remembered = null;
}
