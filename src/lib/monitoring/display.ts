/**
 * Display rules for the admin pipeline monitor. The backend returns raw statuses,
 * timestamps and counts; how they read (words, glyphs, freshness, coverage cut-offs)
 * is decided here so it can be retuned without touching the data path.
 *
 * Colour: no green/red. `ok` is blue, `warn` amber, `fail` violet (see --status-* in
 * app.css), and every status also carries a glyph and a word.
 */
import type {
	DeployedModelRow,
	HistoryCell,
	HistoryDay,
	LineageNode,
	StageStatusName
} from '$lib/server/warehouse';

export type Tone = 'ok' | 'warn' | 'fail' | 'idle';

export const STATUS_TONE: Record<StageStatusName, Tone> = {
	ok: 'ok',
	warn: 'warn',
	fail: 'fail',
	running: 'idle',
	pending: 'idle',
	not_reached: 'idle'
};

export const STATUS_WORD: Record<StageStatusName, string> = {
	ok: 'Succeeded',
	warn: 'Needs a look',
	fail: 'Failed',
	running: 'Running',
	pending: 'Waiting',
	not_reached: 'Not reached'
};

export const STATUS_GLYPH: Record<StageStatusName, string> = {
	ok: '✓',
	warn: '!',
	fail: '✕',
	running: '◐',
	pending: '',
	not_reached: ''
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function hm(mins: number): string {
	if (mins < 60) return `${mins}m`;
	return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/** "4m", "1h 05m" between two timestamps. */
export function duration(fromIso: string | null, toIso: string | null): string {
	if (!fromIso || !toIso) return '';
	return hm(Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MINUTE)));
}

/** "4h 52m" since a timestamp. */
export function elapsed(fromIso: string | null, now: Date): string {
	return fromIso ? duration(fromIso, now.toISOString()) : '';
}

/** "07:18" — UTC, the pipeline's own clock. */
export function clock(iso: string | null): string {
	return iso ? new Date(iso).toISOString().slice(11, 16) : '—';
}

export interface Freshness {
	tone: 'ok' | 'warn';
	label: string;
}

/** Fresh if the table moved after `reference`; otherwise how many days behind it is. */
export function freshness(lastUpdated: string | null, reference: string): Freshness {
	if (!lastUpdated) return { tone: 'warn', label: 'Never updated' };
	const behind = Date.parse(reference) - Date.parse(lastUpdated);
	if (behind <= 0) return { tone: 'ok', label: 'Fresh' };
	const days = Math.max(1, Math.ceil(behind / DAY));
	return { tone: 'warn', label: days === 1 ? 'A day old' : `${days} days old` };
}

/** Today's stage-1 start, or 05:00 UTC on the chain day if stage 1 hasn't run yet. */
export function freshnessReference(today: {
	day: string;
	stages: { started: string | null }[];
}): string {
	return today.stages[0]?.started ?? `${today.day}T05:00:00Z`;
}

export const COVERAGE_FLOOR = 0.995;

export interface Coverage {
	pct: number;
	low: boolean;
}

export function coverage(covered: number | null, universe: number | null): Coverage | null {
	if (covered == null || !universe) return null;
	const pct = covered / universe;
	return { pct, low: pct < COVERAGE_FLOOR };
}


/** A history cell from either API shape: `{status, url}` now, a bare status before. */
export function historyCell(cell: HistoryCell | StageStatusName | undefined): HistoryCell {
	if (cell == null) return { status: 'not_reached', url: null };
	return typeof cell === 'string' ? { status: cell, url: null } : cell;
}

/**
 * A lineage node's status: the same freshness rule as Pipeline's tables. None for
 * views (their last-modified is when the definition changed) or unreadable tables.
 */
export function nodeStatus(node: LineageNode, reference: string): Freshness | null {
	if (node.kind === 'view' || node.error || !node.last_modified) return null;
	return freshness(node.last_modified, reference);
}

/** Stable #each key for a deployed-model row: one per step, per user and outcome. */
export function modelKey(m: {
	model_category: string;
	model_type: string;
	username: string | null;
	model_name: string | null;
	model_version: string | null;
}): string {
	return [m.model_category, m.model_type, m.username, m.model_name, m.model_version].join('|');
}

/** A history day as one old-chain cell (before the cutover) or per-stage cells. */
export function historyDay(
	h: HistoryDay
): { era: 'old'; cell: HistoryCell } | { era: 'new'; stages: Record<string, HistoryCell | StageStatusName> } {
	if (h.era === 'old') return { era: 'old', cell: { status: h.status ?? 'not_reached', url: h.url ?? null } };
	return { era: 'new', stages: h.stages ?? {} };
}

/** A model whose latest run is more than `hours` before the report is not actively scoring. */
export function isStale(lastScored: string | null, generatedAt: string, hours = 48): boolean {
	if (!lastScored) return true;
	return Date.parse(generatedAt) - Date.parse(lastScored) > hours * 60 * MINUTE;
}

/** Every game scoring step, in page order. A missing one has had no run in 30 days. */
export const GAME_MODEL_TYPES = [
	'hurdle', 'rating', 'users_rated', 'geek_rating', 'complexity', 'text_embedding', 'game_embedding'
] as const;

export interface MissingModel {
	model_type: string;
	missing: true;
}

export function splitModels(models: DeployedModelRow[]): {
	game: (DeployedModelRow | MissingModel)[];
	collections: DeployedModelRow[];
} {
	const game = models.filter((m) => m.model_category === 'game');
	return {
		game: GAME_MODEL_TYPES.flatMap((t): (DeployedModelRow | MissingModel)[] => {
			const rows = game.filter((m) => m.model_type === t);
			return rows.length ? rows : [{ model_type: t, missing: true as const }];
		}),
		collections: models.filter((m) => m.model_category === 'collection')
	};
}

const count = new Intl.NumberFormat('en-US');

/**
 * "43,623 of 47,942 (91.0%)": games whose current prediction came from the step's latest
 * model, against every game in its serving table. Never rounds a partial rollout up to 100%.
 */
export function servedLabel(served: number, total: number): string {
	if (!total) return '—';
	const pct = served === total ? '100' : Math.min(99.9, Math.round((served / total) * 1000) / 10).toFixed(1);
	return `${count.format(served)} of ${count.format(total)} (${pct}%)`;
}
