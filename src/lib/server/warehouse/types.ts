/**
 * Wire types for the warehouse read API. These mirror the envelope returned by
 * `GET /games/{id}` (see bgg-data-warehouse readers/games.py `get_game`): a stable
 * top-level shape wrapping an open `features` bag plus optional nested blocks.
 *
 * We type the envelope precisely and keep `features`/`predictions`/etc. loosely
 * typed for now — the game-detail page (PR 4) is where individual fields get
 * pinned down as they're actually consumed.
 */

export interface GamePlayerCount {
	[key: string]: unknown;
}

export interface GameFeatures {
	player_counts: GamePlayerCount[];
	[key: string]: unknown;
}

export interface GameDocument {
	game_id: number;
	features: GameFeatures;
	predictions: Record<string, unknown> | null;
	embedding: Record<string, unknown> | null;
	similar: unknown[];
	provenance: Record<string, unknown> | null;
}

/** Non-2xx from the warehouse, surfaced as a typed error rather than a throw of `any`. */
export class WarehouseError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'WarehouseError';
	}
}

/** Distinguish "game genuinely doesn't exist" (404) from other failures. */
export class GameNotFoundError extends WarehouseError {
	constructor(readonly gameId: number) {
		super(404, `game ${gameId} not found`);
		this.name = 'GameNotFoundError';
	}
}

/**
 * A row from `GET /new-games` — a game first fetched into the warehouse within the
 * requested window. `predicted_hurdle_prob` is raw/unthresholded; tiering into
 * badges is a display decision made by the caller, not this type.
 */
export interface NewGameRow {
	game_id: number;
	name: string;
	year_published: number | null;
	thumbnail: string | null;
	first_seen: string;
	predicted_hurdle_prob: number | null;
}
