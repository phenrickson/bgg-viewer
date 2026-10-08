/** A box's player count as printed on it: "1–4 players", "2 players", "1 player"; null when it lists none. */
export function boxPlayersLabel(min: number | null | undefined, max: number | null | undefined): string | null {
	const lo = min || null;
	const hi = max || null;
	if (lo == null && hi == null) return null;
	const one = lo == null || hi == null || lo === hi;
	const n = one ? (lo ?? hi)! : null;
	return one ? `${n} ${n === 1 ? 'player' : 'players'}` : `${lo}–${hi} players`;
}
