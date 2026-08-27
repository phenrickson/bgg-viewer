/**
 * Single source of truth for "is this the admin" — used by both the security check
 * (API routes) and UI-visibility checks, so the literal email lives in exactly one place.
 * Phase 1 only: no `is_admin` column on the shared `core.users` table (see
 * docs/superpowers/specs/2026-08-26-collection-filter-design.md).
 */
import type { SessionUser } from './session';

export const ADMIN_EMAIL = 'phil.henrickson@gmail.com';

export function isAdmin(user: SessionUser | null | undefined): boolean {
	return user?.email?.toLowerCase() === ADMIN_EMAIL;
}
