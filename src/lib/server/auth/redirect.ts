/**
 * Sanitize a `?next=` value into a safe same-site path. Anything that isn't a
 * plain local path (protocol-relative `//host`, absolute URLs, missing leading
 * slash) falls back to `/` — closes the open-redirect hole on login.
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
	if (!next) return fallback;
	if (!next.startsWith('/') || next.startsWith('//')) return fallback;
	return next;
}
