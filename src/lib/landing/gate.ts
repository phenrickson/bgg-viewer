/**
 * Where a landing-page door leads, depending on whether anyone is signed in.
 *
 * Logged out, every door goes through /login with the room as `next`, so the chip is both the
 * pitch and the delivery: sign in and you land on the exact question you clicked, not a
 * generic home page. Logged in, the door is the room.
 *
 * Extracted from `+page.svelte` so the branching is testable without rendering the page.
 */
export const gate = (loggedIn: boolean, url: string): string =>
	loggedIn ? url : `/login?next=${encodeURIComponent(url)}`;
