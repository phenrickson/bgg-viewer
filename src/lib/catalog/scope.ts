/**
 * The Explore scope — which games are in view. One source of truth that (de)serializes
 * to the URL (shareable, reload-safe) and compiles to a SQL WHERE clause the in-browser
 * DuckDB runs. Numeric bounds are coerced to finite numbers; string facets/search are
 * escaped, so the compiled SQL is injection-safe.
 *
 * "Best at N players" would need player-count vote data that isn't in the catalog
 * artifact; we filter on "supports N players" (min/max) instead — a live module could
 * add best-at later.
 */
export interface Scope {
	q: string;
	yearMin: number | null;
	yearMax: number | null;
	weightMin: number | null;
	weightMax: number | null;
	geekMin: number | null;
	players: number | null;
	/** Community "best at N players" — the flagship filter BGG can't do. */
	bestAt: number | null;
	categories: string[];
	mechanics: string[];
	/** Base population (the "Universe"): top 10k by geek rating, or everything rated. */
	universe: 'top10k' | 'rated';
}

export const DEFAULT_SCOPE: Scope = {
	q: '',
	yearMin: null,
	yearMax: null,
	weightMin: null,
	weightMax: null,
	geekMin: null,
	players: null,
	bestAt: null,
	categories: [],
	mechanics: [],
	universe: 'top10k'
};

const esc = (s: string) => s.replace(/'/g, "''");
const finite = (v: unknown): number | null => {
	if (v == null || v === '') return null; // Number(null) / Number('') are 0 — guard first
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/** Compile the scope to a SQL WHERE body (without the `WHERE` keyword). */
export function toWhere(scope: Scope): string {
	const parts: string[] = [];
	if (scope.universe === 'rated') parts.push('users_rated >= 30');
	else
		// Top 10k by geek rating — an independent subquery over the whole catalog.
		parts.push(
			'game_id IN (SELECT game_id FROM catalog WHERE geek_rating > 0 ORDER BY geek_rating DESC LIMIT 10000)'
		);
	if (scope.yearMin != null) parts.push(`year_published >= ${scope.yearMin}`);
	if (scope.yearMax != null) parts.push(`year_published <= ${scope.yearMax}`);
	if (scope.weightMin != null) parts.push(`average_weight >= ${scope.weightMin}`);
	if (scope.weightMax != null) parts.push(`average_weight <= ${scope.weightMax}`);
	if (scope.geekMin != null) parts.push(`geek_rating >= ${scope.geekMin}`);
	if (scope.players != null)
		parts.push(`min_players <= ${scope.players} AND max_players >= ${scope.players}`);
	if (scope.bestAt != null) parts.push(`list_contains(best_player_counts, ${scope.bestAt})`);
	for (const c of scope.categories) parts.push(`list_contains(categories, '${esc(c)}')`);
	for (const m of scope.mechanics) parts.push(`list_contains(mechanics, '${esc(m)}')`);
	const q = scope.q.trim().toLowerCase();
	if (q.length >= 2) parts.push(`lower(name) LIKE '%${esc(q)}%'`);
	return parts.length ? parts.join(' AND ') : 'TRUE';
}

/** Serialize to URLSearchParams — only non-default values, for clean shareable URLs. */
export function scopeToParams(scope: Scope): URLSearchParams {
	const p = new URLSearchParams();
	if (scope.q) p.set('q', scope.q);
	if (scope.yearMin != null) p.set('ymin', String(scope.yearMin));
	if (scope.yearMax != null) p.set('ymax', String(scope.yearMax));
	if (scope.weightMin != null) p.set('wmin', String(scope.weightMin));
	if (scope.weightMax != null) p.set('wmax', String(scope.weightMax));
	if (scope.geekMin != null) p.set('gmin', String(scope.geekMin));
	if (scope.players != null) p.set('p', String(scope.players));
	if (scope.bestAt != null) p.set('best', String(scope.bestAt));
	if (scope.categories.length) p.set('cats', scope.categories.join(','));
	if (scope.mechanics.length) p.set('mechs', scope.mechanics.join(','));
	if (scope.universe !== 'top10k') p.set('u', scope.universe);
	return p;
}

/** Parse a scope back from URLSearchParams, falling back to defaults. */
export function scopeFromParams(params: URLSearchParams): Scope {
	const list = (key: string) =>
		(params.get(key) ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	return {
		q: params.get('q') ?? '',
		yearMin: finite(params.get('ymin')),
		yearMax: finite(params.get('ymax')),
		weightMin: finite(params.get('wmin')),
		weightMax: finite(params.get('wmax')),
		geekMin: finite(params.get('gmin')),
		players: finite(params.get('p')),
		bestAt: finite(params.get('best')),
		categories: list('cats'),
		mechanics: list('mechs'),
		universe: params.get('u') === 'rated' ? 'rated' : 'top10k'
	};
}
