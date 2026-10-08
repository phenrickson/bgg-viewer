/**
 * A box's player count as printed on it: "1–4 players", "2 players", "1 player"; null when it
 * lists none. `short` drops the word for beside a players icon: "1–4", "2".
 */
export function boxPlayersLabel(
	min: number | null | undefined,
	max: number | null | undefined,
	short = false
): string | null {
	const lo = min || null;
	const hi = max || null;
	if (lo == null && hi == null) return null;
	const one = lo == null || hi == null || lo === hi;
	const n = one ? (lo ?? hi)! : null;
	const count = one ? `${n}` : `${lo}–${hi}`;
	return short ? count : `${count} ${n === 1 ? 'player' : 'players'}`;
}
