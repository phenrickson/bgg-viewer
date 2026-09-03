import { describe, it, expect } from 'vitest';
import { buildReviewHtml, parseReview, reviewId, type ReviewSpec } from './review';

const spec: ReviewSpec = {
	a: 'baseline',
	b: 'tuned-v2',
	games: [
		{
			id: 13,
			name: 'Catan',
			year: 1995,
			listA: [{ name: 'CATAN 3D Edition', year: 2021 }],
			listB: [{ name: 'Lords of Vegas', year: 2010 }]
		},
		{
			id: 30549,
			name: 'Pandemic </script> trick',
			year: 2008,
			listA: [{ name: 'Pandemic Legacy: Season 1', year: 2015 }],
			listB: [{ name: 'Iberia', year: 2016 }]
		}
	]
};

describe('buildReviewHtml', () => {
	const html = buildReviewHtml(spec);

	it('is a self-contained document', () => {
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<script id="data" type="application/json">');
		expect(html).not.toContain('src=');
	});

	it('keeps the experiment names out of the <title> (they show in the browser tab)', () => {
		const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
		expect(title).not.toContain('baseline');
		expect(title).not.toContain('tuned-v2');
	});

	it('escapes </script> in the embedded payload so it cannot break out', () => {
		const payload = html.split('type="application/json">')[1].split('</script>')[0];
		expect(payload).not.toContain('</script>');
		expect(payload).toContain('\\u003c/script>'); // the game name's </script> survived, escaped
	});

	it('shuffles a game the same way every build (deterministic flip)', () => {
		expect(buildReviewHtml(spec)).toBe(html);
	});

	it('orders games by id-hash, not the order they were fed in', () => {
		const reversed = { ...spec, games: [...spec.games].reverse() };
		expect(buildReviewHtml(reversed)).toBe(html);
	});

	it('marks items unique to one list with an `only` flag, shared items without', () => {
		const shared: ReviewSpec = {
			a: 'x',
			b: 'y',
			games: [
				{
					id: 42,
					name: 'Src',
					year: 2000,
					listA: [{ name: 'Both', year: 1999 }, { name: 'OnlyA', year: 2001 }],
					listB: [{ name: 'Both', year: 1999 }, { name: 'OnlyB', year: 2002 }]
				}
			]
		};
		const payload = JSON.parse(
			buildReviewHtml(shared)
				.split('type="application/json">')[1]
				.split('</script>')[0]
				.replace(/\\u003c/g, '<')
		);
		const g = payload.games[0];
		const all = [...g.l1, ...g.l2];
		expect(all.find((i: { name: string }) => i.name === 'Both').only).toBe(false);
		expect(all.filter((i: { only: boolean }) => i.only).map((i: { name: string }) => i.name).sort()).toEqual(
			['OnlyA', 'OnlyB']
		);
	});

	it('is the scroll view: every game in the payload, rows built from it, ellipsis on rows', () => {
		const payload = JSON.parse(
			html.split('type="application/json">')[1].split('</script>')[0].replace(/\\u003c/g, '<')
		);
		expect(payload.games.map((g: { id: number }) => g.id).sort()).toEqual([13, 30549]);
		expect(payload.rid).toMatch(/^[a-z0-9]{7}$/);
		expect(html).toContain('rowsEl.innerHTML = D.games.map');
		expect(html).toContain('text-overflow: ellipsis');
	});
});

describe('reviewId', () => {
	it('is stable for the same pair + panel, differs when either changes', () => {
		expect(reviewId(spec)).toBe(reviewId(spec));
		expect(reviewId({ ...spec, a: 'other' })).not.toBe(reviewId(spec));
		expect(reviewId({ ...spec, games: spec.games.slice(0, 1) })).not.toBe(reviewId(spec));
		expect(reviewId(spec)).toMatch(/^[a-z0-9]{7}$/);
	});
});

describe('parseReview', () => {
	it('reads a well-formed blob', () => {
		const blob = JSON.stringify({
			kind: 'similar-review',
			v: 1,
			a: 'baseline',
			b: 'tuned-v2',
			completedAt: '2026-09-02T20:00:00.000Z',
			answers: [
				{ id: 13, name: 'Catan', choice: 'b', note: 'v2 dodges clones' },
				{ id: 30549, name: 'Pandemic', choice: 'tie', note: '' }
			]
		});
		const r = parseReview(blob);
		expect(typeof r).not.toBe('string');
		if (typeof r === 'string') return;
		expect(r.a).toBe('baseline');
		expect(r.answers).toHaveLength(2);
		expect(r.answers[0]).toEqual({ id: 13, name: 'Catan', choice: 'b', note: 'v2 dodges clones' });
	});

	it('drops malformed answer rows but keeps the good ones', () => {
		const blob = JSON.stringify({
			kind: 'similar-review',
			a: 'x',
			b: 'y',
			answers: [{ id: 1, choice: 'a' }, { id: 2, choice: 'nonsense' }, { choice: 'b' }]
		});
		const r = parseReview(blob);
		if (typeof r === 'string') throw new Error(r);
		expect(r.answers).toHaveLength(1);
		expect(r.answers[0].id).toBe(1);
	});

	it('rejects non-JSON and foreign objects', () => {
		expect(typeof parseReview('not json')).toBe('string');
		expect(typeof parseReview('{"kind":"something-else"}')).toBe('string');
		expect(typeof parseReview('{"kind":"similar-review"}')).toBe('string');
	});
});
