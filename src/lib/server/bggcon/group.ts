/**
 * BGG.CON library: Tabletop.Events copies → games, and which games are on the shelf.
 *
 * Tabletop.Events lists physical COPIES (8,545 rows, 2026-11-12), not games: one game can
 * have several copies, each with its own id and checkout state. Explore and `/bggcon` think
 * in games keyed by BGG id, so both sides count by BGG id:
 *
 * - the universe (`groupLibrary`): which games, and how many copies. Built daily.
 * - availability (`checkedOutByGame`): how many copies are out right now. Polled.
 *
 * The two are deliberately independent; the page combines them ("N of M on the shelf").
 *
 * Pure: no fetching, no clock.
 */

/** The fields we read from a Tabletop.Events LibraryGame row. */
export interface TteRow {
	id: string;
	bgg_id: number | null;
	name: string;
	is_checked_out: number;
	is_in_circulation: number;
	is_play_to_win: number;
	custom_fields?: { ItemType?: string } | null;
}

export interface LibraryGame {
	bgg_id: number;
	/** The first copy's name. Copies of one game share it in practice. */
	name: string;
	copies: number;
	play_to_win: boolean;
}

export interface Grouped {
	games: LibraryGame[];
	/** What was left out and why, for the snapshot's log line. */
	dropped: { outOfCirculation: number; notStandalone: number; noBggId: number };
}

export function groupLibrary(rows: TteRow[]): Grouped {
	const dropped = { outOfCirculation: 0, notStandalone: 0, noBggId: 0 };
	const byId = new Map<number, LibraryGame>();

	for (const r of rows) {
		if (!r.is_in_circulation) {
			dropped.outOfCirculation++;
			continue;
		}
		// Expansions (and the odd playmat) aren't games you check out to play on their own.
		if ((r.custom_fields?.ItemType ?? '').trim().toLowerCase() !== 'standalone') {
			dropped.notStandalone++;
			continue;
		}
		if (!r.bgg_id) {
			dropped.noBggId++;
			continue;
		}
		const g = byId.get(r.bgg_id);
		if (g) {
			g.copies++;
			g.play_to_win ||= !!r.is_play_to_win;
		} else {
			byId.set(r.bgg_id, {
				bgg_id: r.bgg_id,
				name: r.name,
				copies: 1,
				play_to_win: !!r.is_play_to_win
			});
		}
	}
	return { games: [...byId.values()], dropped };
}

/** Checked-out copies per BGG id, from the checked-out rows alone. */
export function checkedOutByGame(rows: TteRow[]): Record<number, number> {
	const out: Record<number, number> = {};
	for (const r of rows) if (r.bgg_id) out[r.bgg_id] = (out[r.bgg_id] ?? 0) + 1;
	return out;
}
