import { describe, it, expect } from 'vitest';
import { listSql, countSql, countsSql } from './queries';

const base = { availableOnly: false, offset: 0, limit: 50 };

describe('listSql', () => {
	// The whole library is the catalog-matched games, filtered by Explore's own scope.
	it('whole library joins the catalog and applies the scope where', () => {
		const sql = listSql({ ...base, mode: 'all', where: 'users_rated >= 30' });
		expect(sql).toContain('JOIN catalog c USING (game_id)');
		expect(sql).not.toContain('LEFT JOIN catalog');
		expect(sql).toContain('WHERE users_rated >= 30');
		expect(sql).toContain('LIMIT 50 OFFSET 0');
	});

	// A starred game that isn't in the catalog must still show.
	it('focus list keeps games missing from the catalog', () => {
		const sql = listSql({ ...base, mode: 'focus', ids: [13, 7865] });
		expect(sql).toContain('LEFT JOIN catalog c USING (game_id)');
		expect(sql).toContain('l.game_id IN (13, 7865)');
	});

	it('an empty focus list matches nothing', () => {
		expect(listSql({ ...base, mode: 'focus', ids: [] })).toContain('FALSE');
	});

	it('not in catalog lists library games the catalog lacks, searchable by name', () => {
		const sql = listSql({ ...base, mode: 'missing', q: "it's" });
		expect(sql).toContain('l.game_id NOT IN (SELECT game_id FROM catalog)');
		expect(sql).toContain("l.tte_name ILIKE '%it''s%'");
	});

	it('available-only narrows to games with a copy on the shelf', () => {
		const sql = listSql({ ...base, mode: 'focus', ids: [1], availableOnly: true });
		expect(sql).toContain('l.copies - COALESCE(o.n, 0) > 0');
	});

	it('in-use-only narrows to games with a copy checked out', () => {
		const sql = listSql({ ...base, mode: 'all', where: 'TRUE', inUseOnly: true });
		const where = sql.slice(sql.indexOf('WHERE'), sql.indexOf('ORDER BY'));
		expect(where).toContain('TRUE AND COALESCE(o.n, 0) > 0');
	});

	it('lists games on the shelf first', () => {
		expect(listSql({ ...base, mode: 'focus', ids: [1] })).toMatch(/ORDER BY \(l\.copies - COALESCE\(o\.n, 0\) > 0\) DESC/);
	});

	it('coerces paging and ids to integers', () => {
		const sql = listSql({ mode: 'focus', ids: [1.7, Number.NaN], availableOnly: false, offset: 2.5, limit: 9.9 });
		expect(sql).toContain('l.game_id IN (1)');
		expect(sql).toContain('LIMIT 9 OFFSET 2');
	});
});

describe('countSql', () => {
	it('counts the same set the list pages through, without paging', () => {
		const sql = countSql({ mode: 'all', where: 'x = 1', availableOnly: false });
		expect(sql).toMatch(/^SELECT COUNT\(\*\)::INT AS n FROM/);
		expect(sql).toContain('WHERE x = 1');
		expect(sql).not.toContain('LIMIT');
	});
});

describe('countsSql', () => {
	it('reports games, games on the shelf, copies out and games not in the catalog', () => {
		const sql = countsSql();
		for (const col of ['games', 'on_shelf', 'copies_out', 'not_in_catalog']) expect(sql).toContain(`AS ${col}`);
	});
});

describe('listSql: rating', () => {
	// The app's rating primitive (RatingBar) shows the geek rating.
	it('selects the geek rating', () => {
		const sql = listSql({ mode: 'all', where: 'TRUE', availableOnly: false, offset: 0, limit: 1 });
		expect(sql.slice(0, sql.indexOf('FROM'))).toContain('c.geek_rating');
	});
});
