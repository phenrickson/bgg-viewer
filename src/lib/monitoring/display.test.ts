import { describe, expect, it } from 'vitest';
import {
	clock,
	GAME_MODEL_TYPES,
	historyDay,
	isStale,
	servedLabel,
	splitModels,
	coverage,
	duration,
	elapsed,
	freshness,
	freshnessReference,
	historyCell,
	nodeStatus,
	modelKey,
	STATUS_GLYPH,
	STATUS_TONE,
	STATUS_WORD
} from './display';

describe('status vocabulary', () => {
	it('gives every status a word, and a tone that is never green/red by name', () => {
		for (const s of ['ok', 'warn', 'fail', 'running', 'pending', 'not_reached'] as const) {
			expect(STATUS_WORD[s]).toBeTruthy();
			expect(['ok', 'warn', 'fail', 'idle']).toContain(STATUS_TONE[s]);
			expect(STATUS_GLYPH[s]).toBeTypeOf('string');
		}
	});
});

describe('duration / clock / elapsed', () => {
	it('formats minutes and hours', () => {
		expect(duration('2026-10-02T06:26:05Z', '2026-10-02T06:30:10Z')).toBe('4m');
		expect(duration('2026-10-02T06:26:00Z', '2026-10-02T07:31:00Z')).toBe('1h 05m');
		expect(duration(null, '2026-10-02T07:31:00Z')).toBe('');
	});
	it('shows UTC wall time', () => {
		expect(clock('2026-10-02T07:18:57Z')).toBe('07:18');
		expect(clock(null)).toBe('—');
	});
	it('says how long ago', () => {
		const now = new Date('2026-10-02T12:16:00Z');
		expect(elapsed('2026-10-02T07:24:00Z', now)).toBe('4h 52m');
		expect(elapsed(null, now)).toBe('');
	});
});

describe('freshness', () => {
	const ref = '2026-10-02T06:26:05Z';
	it('is fresh when updated after the chain started', () => {
		expect(freshness('2026-10-02T07:29:00Z', ref)).toEqual({ tone: 'ok', label: 'Fresh' });
	});
	it('counts days behind', () => {
		expect(freshness('2026-10-01T07:29:00Z', ref)).toEqual({ tone: 'warn', label: 'A day old' });
		expect(freshness('2026-09-29T07:29:00Z', ref)).toEqual({ tone: 'warn', label: '3 days old' });
	});
	it('handles never', () => {
		expect(freshness(null, ref)).toEqual({ tone: 'warn', label: 'Never updated' });
	});
	it('uses stage 1 start, else 05:00 UTC on the chain day', () => {
		expect(freshnessReference({ day: '2026-10-02', stages: [{ started: ref }] })).toBe(ref);
		expect(freshnessReference({ day: '2026-10-02', stages: [{ started: null }] })).toBe(
			'2026-10-02T05:00:00Z'
		);
	});
});

describe('coverage', () => {
	it('computes a share and flags below 99.5%', () => {
		expect(coverage(39316, 39316)).toEqual({ pct: 1, low: false });
		expect(coverage(994, 1000)).toEqual({ pct: 0.994, low: true });
	});
	it('is null without a universe', () => {
		expect(coverage(null, null)).toBeNull();
		expect(coverage(5, 0)).toBeNull();
	});
});


describe('historyCell', () => {
	it('accepts the old string shape, the new object shape, and a missing cell', () => {
		expect(historyCell('ok')).toEqual({ status: 'ok', url: null });
		expect(historyCell({ status: 'fail', url: 'https://github.com/x' })).toEqual({
			status: 'fail',
			url: 'https://github.com/x'
		});
		expect(historyCell(undefined)).toEqual({ status: 'not_reached', url: null });
	});
});

describe('nodeStatus', () => {
	const ref = '2026-10-03T06:26:05Z';
	const node = {
		id: 'p.d.t', project: 'p', dataset: 'd', name: 't', kind: 'table' as const,
		rows: 1, bytes: 1, last_modified: '2026-10-03T07:19:00Z', type: 'TABLE', error: null
	};
	it('is the freshness of a table', () => {
		expect(nodeStatus(node, ref)).toEqual({ tone: 'ok', label: 'Fresh' });
		expect(nodeStatus({ ...node, last_modified: '2026-10-01T07:00:00Z' }, ref)?.tone).toBe('warn');
	});
	it('is null for views, unreadable tables and tables without a timestamp', () => {
		expect(nodeStatus({ ...node, kind: 'view' }, ref)).toBeNull();
		expect(nodeStatus({ ...node, error: 'no access' }, ref)).toBeNull();
		expect(nodeStatus({ ...node, last_modified: null }, ref)).toBeNull();
	});
});

const row = (o: Partial<import('$lib/server/warehouse').DeployedModelRow>) => ({
	model_category: 'game' as const, model_type: 'hurdle', username: null, model_name: 'hurdle-v2026',
	model_version: '3', last_scored: '2026-10-06T16:14:00Z', games_served: 43623, games_total: 47942, job_id: 'j', ...o
});

describe('historyDay', () => {
	it('reads an old-era day as one cell', () => {
		expect(historyDay({ day: '2026-10-05', era: 'old', status: 'ok', url: 'u' })).toEqual({
			era: 'old', cell: { status: 'ok', url: 'u' }
		});
	});
	it('reads a new-era day, and a day from an API without era, as stages', () => {
		const stages = { ml_pipeline: { status: 'ok' as const, url: null, side: 'fail' as const } };
		expect(historyDay({ day: '2026-10-07', era: 'new', stages })).toEqual({ era: 'new', stages });
		expect(historyDay({ day: '2026-10-02', stages })).toEqual({ era: 'new', stages });
	});
});

describe('isStale', () => {
	it('is stale past 48 hours before generated_at, or with no run', () => {
		expect(isStale('2026-10-06T16:00:00Z', '2026-10-08T15:59:00Z')).toBe(false);
		expect(isStale('2026-10-06T16:00:00Z', '2026-10-08T16:01:00Z')).toBe(true);
		expect(isStale(null, '2026-10-08T00:00:00Z')).toBe(true);
	});
});

describe('splitModels', () => {
	it('splits game and collection rows', () => {
		const c = row({ model_category: 'collection', model_type: 'own', username: 'phenrickson' });
		const { game, collections } = splitModels([row({}), c]);
		expect(collections).toEqual([c]);
		expect(game[0]).toEqual(row({}));
	});
	it('lists missing game model types', () => {
		const { game } = splitModels([row({})]);
		expect(game.map((g) => g.model_type)).toEqual([...GAME_MODEL_TYPES]);
		expect(game.find((g) => g.model_type === 'complexity')).toEqual({ model_type: 'complexity', missing: true });
	});
	it('keeps two rows when one run used two versions', () => {
		const { game } = splitModels([row({}), row({ model_version: '4' })]);
		expect(game.filter((g) => g.model_type === 'hurdle')).toHaveLength(2);
	});
});

describe('modelKey', () => {
	it('separates collection users and outcomes', () => {
		const a = row({ model_category: 'collection', model_type: 'own', username: 'a' });
		const b = row({ model_category: 'collection', model_type: 'own', username: 'b' });
		expect(modelKey(a)).not.toBe(modelKey(b));
	});
});

describe('servedLabel', () => {
	it('reads games served by the current model against the serving table', () => {
		expect(servedLabel(43623, 47942)).toBe('43,623 of 47,942 (91.0%)');
		expect(servedLabel(129480, 129480)).toBe('129,480 of 129,480 (100%)');
		expect(servedLabel(0, 0)).toBe('—');
	});
	it('flags a partial rollout', () => {
		expect(servedLabel(230, 43564)).toBe('230 of 43,564 (0.5%)');
	});
});
