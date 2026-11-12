import { describe, it, expect } from 'vitest';
import { listSql, countSql, countsSql, tableWhere, LIBRARY_FROM, LIBRARY_NAME, LIBRARY_SELECT, AVAILABLE_SORT } from './queries';

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

describe('tableWhere (the library through GameList)', () => {
	// The table reads the library first (LIBRARY_FROM), so each view says which games it wants.
	it('whole library: catalog-matched games, filtered by the scope', () => {
		const w = tableWhere({ mode: 'all', where: 'users_rated >= 30', availableOnly: false });
		expect(w).toBe('c.game_id IS NOT NULL AND (users_rated >= 30)');
	});

	it('focus: the starred ids, catalog or not; none matches nothing', () => {
		expect(tableWhere({ mode: 'focus', ids: [13, 7865], availableOnly: false })).toBe('l.game_id IN (13, 7865)');
		expect(tableWhere({ mode: 'focus', ids: [], availableOnly: false })).toBe('FALSE');
	});

	it('not in catalog: library games the catalog lacks, searchable by their library name', () => {
		expect(tableWhere({ mode: 'missing', availableOnly: false })).toBe('c.game_id IS NULL');
		expect(tableWhere({ mode: 'missing', q: "it's", availableOnly: false })).toBe(
			"c.game_id IS NULL AND l.tte_name ILIKE '%it''s%' ESCAPE '\\'"
		);
	});

	it('adds the availability filters', () => {
		expect(tableWhere({ mode: 'focus', ids: [1], availableOnly: true })).toBe('l.game_id IN (1) AND l.copies - COALESCE(o.n, 0) > 0');
		expect(tableWhere({ mode: 'focus', ids: [1], availableOnly: false, inUseOnly: true })).toBe('l.game_id IN (1) AND COALESCE(o.n, 0) > 0');
	});

	it('reads from the library, joining the catalog and what is checked out', () => {
		expect(LIBRARY_FROM).toMatch(/^con_library l LEFT JOIN catalog c USING \(game_id\)/);
		expect(LIBRARY_FROM).toContain('LEFT JOIN con_checked_out o USING (game_id)');
		expect(LIBRARY_NAME).toBe('COALESCE(c.name, l.tte_name)');
		expect(LIBRARY_SELECT).toContain('AS available');
		expect(LIBRARY_SELECT).toContain('(c.game_id IS NOT NULL) AS in_catalog');
	});
});

describe('listSql: zero means missing', () => {
	// BGG stores a missing geek rating, average rating or weight as 0; this page shows "—".
	it('reads 0 ratings and weights as NULL', () => {
		const sql = listSql({ mode: 'all', where: 'TRUE', availableOnly: false, offset: 0, limit: 1 });
		for (const col of ['geek_rating', 'average_rating', 'average_weight'])
			expect(sql).toContain(`NULLIF(c.${col}, 0) AS ${col}`);
	});
});

describe('AVAILABLE_SORT', () => {
	it('sorts on whether a copy is available, not how many', () => {
		expect(AVAILABLE_SORT).toBe('(l.copies - COALESCE(o.n, 0) > 0)');
	});
});

describe('listSql: player counts', () => {
	it('selects best and recommended player counts', () => {
		const sql = listSql({ mode: 'all', where: 'TRUE', availableOnly: false, offset: 0, limit: 1 });
		const select = sql.slice(0, sql.indexOf('FROM'));
		expect(select).toContain('c.best_player_counts');
		expect(select).toContain('c.recommended_player_counts');
	});
});
