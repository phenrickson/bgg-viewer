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

/** One neighbour in a `similar` / `similar_profiles.*` list. `distance` is cosine
 *  distance (0 = identical); the view model turns it into `similarity = 1 - distance`.
 *  `average_rating` / `geek_rating` are absent on a warehouse deployed before
 *  bgg-data-warehouse #112. */
export interface SimilarWireRow {
	game_id: number;
	name: string;
	year_published: number | null;
	distance: number;
	average_rating?: number | null;
	geek_rating?: number | null;
}

export interface GameDocument {
	game_id: number;
	features: GameFeatures;
	predictions: Record<string, unknown> | null;
	embedding: Record<string, unknown> | null;
	/** The neighbour list for the `?profile=`-selected profile (default `similar`). */
	similar: SimilarWireRow[];
	/** Every profile's neighbour list, keyed by profile name; a profile with no list
	 *  for this game is `[]`. Absent on a warehouse deployed before bgg-data-warehouse
	 *  #109 — callers fall back to `{ similar }`. */
	similar_profiles?: Record<string, SimilarWireRow[]>;
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

/** Stage statuses from GET /monitoring/pipeline — the warehouse's src/monitoring/chain.py. */
export type StageStatusName = 'ok' | 'warn' | 'fail' | 'running' | 'pending' | 'not_reached';
export type Lane = 'warehouse' | 'models' | 'viewer';

export interface PipelineStage {
	key: string;
	label: string;
	lane: Lane;
	status: StageStatusName;
	started: string | null;
	finished: string | null;
	url: string | null;
	event: string | null;
	title: string | null;
	note: string | null;
}

export interface PipelineVerdict {
	status: 'ok' | 'running' | 'warn' | 'fail';
	stage: string | null;
	headline: string;
	since: string | null;
	duration_minutes: number | null;
}

export interface PipelineTableRow {
	table: string;
	last_updated: string | null;
	games: number;
	covered: number | null;
	universe: number | null;
	users: number | null;
}

/** One model version still serving games. Several rows for a type = an older version lingers. */
export interface DeployedModelRow {
	model_category: 'prediction' | 'embedding';
	model_type: string;
	model_name: string | null;
	/** A string so both `3` and year-style versions like `2027.0.1` fit. */
	model_version: string | null;
	experiment: string | null;
	algorithm: string | null;
	games_count: number;
	last_updated: string | null;
}

export interface PipelineStatus {
	generated_at: string;
	verdict: PipelineVerdict;
	today: { day: string; stages: PipelineStage[]; off_chain: PipelineStage[] };
	history: { day: string; stages: Record<string, StageStatusName> }[];
	tables: PipelineTableRow[];
	models: DeployedModelRow[];
}
