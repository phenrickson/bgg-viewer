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


export interface PipelineStep {
	key: string;
	label: string;
	/** `main` gates publish; `side` (collections) is shown but never blocks it. */
	branch: 'main' | 'side';
	status: StageStatusName;
	started: string | null;
	finished: string | null;
	url: string | null;
	note: string | null;
}

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
	/** ML Pipeline only: its jobs grouped into steps. */
	steps?: PipelineStep[] | null;
}

/** The model a scoring step used in its latest run. Collections: one per user and outcome. */
export interface DeployedModelRow {
	model_category: 'game' | 'collection';
	model_type: string;
	username: string | null;
	model_name: string | null;
	model_version: string | null;
	last_scored: string | null;
	games_scored: number;
	job_id: string | null;
}

/** A history day: one "old chain" cell before the cutover, per-stage cells after. */
export interface HistoryDay {
	day: string;
	era?: 'old' | 'new';
	status?: StageStatusName;
	url?: string | null;
	stages?: Record<string, HistoryCell | StageStatusName>;
}

export interface PipelineStatus {
	generated_at: string;
	verdict: PipelineVerdict;
	today: { day: string; stages: PipelineStage[]; off_chain: PipelineStage[] };
	history: HistoryDay[];
	tables: PipelineTableRow[];
	models: DeployedModelRow[];
}

/** One history cell: its status and the run it came from. Old APIs sent the status alone. */
export interface HistoryCell {
	status: StageStatusName;
	url: string | null;
	/** ML Pipeline: whether a side step (collections) failed that day; null if not fetched. */
	side?: 'ok' | 'fail' | null;
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




export type LineageKind = 'table' | 'incremental' | 'view' | 'source' | 'operation' | 'assertion';

export interface LineageNode {
	id: string;
	project: string;
	dataset: string;
	name: string;
	kind: LineageKind;
	rows: number | null;
	bytes: number | null;
	last_modified: string | null;
	type: string | null;
	error: string | null;
}

export interface Lineage {
	generated_at: string;
	compilation: { name: string; created: string | null; commit: string | null };
	nodes: LineageNode[];
	edges: [string, string][];
}

export interface SchemaField {
	name: string;
	type: string;
	mode: string | null;
	description: string | null;
}

export interface TableSchema {
	id: string;
	schema: SchemaField[];
}
