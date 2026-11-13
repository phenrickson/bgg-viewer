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

/**
 * Player counts as the game page's "Best at" states them: "1, 3" but "1–4", since a run of
 * three or more reads worse spelled out than bridged. "6+" stays as it is.
 */
export function compactCounts(counts: (string | number)[]): string {
	const c = counts.map(String);
	const plain = (s: string) => !s.includes('+') && Number.isFinite(Number(s));
	const out: string[] = [];
	for (let i = 0; i < c.length; ) {
		let j = i;
		while (j + 1 < c.length && plain(c[j]) && plain(c[j + 1]) && Number(c[j + 1]) === Number(c[j]) + 1) j++;
		out.push(j > i + 1 ? `${c[i]}–${c[j]}` : c.slice(i, j + 1).join(', '));
		i = j + 1;
	}
	return out.join(', ');
}
