/**
 * Password hashing/verification. bcrypt via bcryptjs (pure JS — no native build).
 * Verifies the Python-`bcrypt` `$2b$` hashes already stored in `core.users`, so
 * existing accounts work unchanged. Runs only at login/register, never per request.
 */
import bcrypt from 'bcryptjs';

const COST = 12; // matches dash-viewer's bcrypt.gensalt() default

export function hashPassword(plain: string): string {
	return bcrypt.hashSync(plain, COST);
}

export function verifyPassword(plain: string, hash: string): boolean {
	if (!hash) return false;
	try {
		return bcrypt.compareSync(plain, hash);
	} catch {
		return false;
	}
}
