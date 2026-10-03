/**
 * Display rules for the admin pipeline monitor. The backend returns raw statuses,
 * timestamps and counts; how they read (words, glyphs, freshness, coverage cut-offs)
 * is decided here so it can be retuned without touching the data path.
 *
 * Colour: no green/red. `ok` is blue, `warn` amber, `fail` violet (see --status-* in
 * app.css), and every status also carries a glyph and a word.
 */
import type { StageStatusName } from '$lib/server/warehouse';

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

/**
 * Stable #each key for a deployed-model row. deployed_models groups by experiment
 * (predictions) or algorithm (embeddings) as well as name and version, so those are
 * part of the identity; a key without them can repeat and crash the list.
 */
export function modelKey(m: {
	model_type: string;
	model_name: string | null;
	model_version: string | null;
	experiment: string | null;
	algorithm: string | null;
}): string {
	return [m.model_type, m.model_name, m.model_version, m.experiment, m.algorithm].join('|');
}
