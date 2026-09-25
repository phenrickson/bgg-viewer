/**
 * The play-time scale shared by Explore's slider and Discover's dial.
 *
 * Minutes are not linear to a reader — 15 vs 30 is a different game, 200 vs 215 is not — so
 * the slider moves over TICKS by index rather than over minutes. The first tick (0) is "no
 * minimum" and the last (240) is "no maximum", which is how `RangeSlider`/`toBounds` read a
 * handle parked at an edge; the 600-minute wargame tail collapses into "4h+".
 */
export const PLAYTIME_TICKS = [0, 15, 30, 45, 60, 90, 120, 180, 240] as const;
export const PLAYTIME_DOMAIN = { lo: 0, hi: PLAYTIME_TICKS.length - 1 };

/** Slider index → minutes. */
export function minutesAt(index: number): number {
	const i = Math.max(0, Math.min(PLAYTIME_DOMAIN.hi, Math.round(index)));
	return PLAYTIME_TICKS[i];
}

/**
 * Minutes → slider index; `null` stays `null` (unbounded). A value between ticks — a
 * hand-written `?tmax=50` — parks the handle on the nearest tick for display; the scope keeps
 * the exact value until the handle is moved.
 */
export function indexAt(minutes: number | null): number | null {
	if (minutes == null) return null;
	let best = 0;
	for (let i = 1; i < PLAYTIME_TICKS.length; i++)
		if (Math.abs(PLAYTIME_TICKS[i] - minutes) < Math.abs(PLAYTIME_TICKS[best] - minutes)) best = i;
	return best;
}

/** "45 min", "1h", "1h 30", "4h+" — for a slider handle or tick label. */
export function formatMinutes(minutes: number, open = false): string {
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}h${m ? ` ${m}` : ''}${open ? '+' : ''}`;
}
