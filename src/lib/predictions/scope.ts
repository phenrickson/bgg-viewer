/**
 * The Predictions scope — which upcoming games are in view, and how they're ordered.
 *
 * Deliberately NOT an extension of Explore's `Scope`. The two populations are asked
 * different questions: Explore's universe dial is `top10k | rated`, both of which filter on
 * `geek_rating` / `users_rated` — columns that are null or zero for a game nobody has played
 * yet. Widening that union with `upcoming` would put a third state on a shipped type where
 * two thirds of its numeric filters are inapplicable, and put `minHurdle` on a type that has
 * no use for it. The shared pieces are the *components* (`FacetList`, `EntityFilter`), and
 * those take a `where` string, so they don't care whose scope produced it.
 *
 * Same contract as Explore's scope otherwise: one source of truth that (de)serializes to the
 * URL and compiles to a SQL WHERE the in-browser DuckDB runs. String values are escaped.
 */
import { COMPLEXITY_BANDS, type ComplexityBand } from '$lib/discover/dials';

/** Sortable columns. Keys map to fixed SQL — never user input. */
export const SORT_COLUMNS = {
	geek: { label: 'P. Geek', sql: 'predicted_geek_rating' },
	rating: { label: 'P. Avg', sql: 'predicted_rating' },
	complexity: { label: 'P. Complexity', sql: 'predicted_complexity' },
	hurdle: { label: 'P(hurdle)', sql: 'predicted_hurdle_prob' },
	users: { label: 'P. Ratings', sql: 'predicted_users_rated' },
	name: { label: 'Game', sql: 'lower(name)' },
	year: { label: 'Year', sql: 'year_published' }
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;

export interface PredictionScope {
	/**
	 * The single publication year in view. One year at a time, not a range: 4,347 of the
	 * ~4,800 upcoming games are the current year, so a range would collapse to the same set
	 * while being vaguer about what you're looking at. `null` only before the catalog has
	 * reported which years exist.
	 */
	year: number | null;
	/** Predicted complexity band — single-select, contiguous, from Discover's vocabulary. */
	weightMin: number | null;
	weightMax: number | null;
	/** Supports N players (the box's range, not a community vote — nobody has voted yet). */
	players: number | null;
	categories: string[];
	mechanics: string[];
	designers: string[];
	publishers: string[];
	/**
	 * Floor on `predicted_hurdle_prob`. A quality gate, not a headline: most BGG entries
	 * never gather enough ratings to earn a geek rating, and without a floor the tail of
	 * self-published and placeholder entries crowds the list.
	 */
	minHurdle: number | null;
	sort: SortKey;
	desc: boolean;
}

/**
 * The default floor. Chosen to clear the noise without editorialising: at 0.25 the list
 * keeps everything with a real chance of being rated and drops entries that exist as a BGG
 * record and little else. Surfaced as a control so it is visible rather than assumed.
 */
export const DEFAULT_MIN_HURDLE = 0.25;

export const DEFAULT_PREDICTION_SCOPE: PredictionScope = {
	year: null,
	weightMin: null,
	weightMax: null,
	players: null,
	categories: [],
	mechanics: [],
	designers: [],
	publishers: [],
	minHurdle: DEFAULT_MIN_HURDLE,
	sort: 'geek',
	desc: true
};

const esc = (s: string) => s.replace(/'/g, "''");
const finite = (v: unknown): number | null => {
	if (v == null || v === '') return null; // Number(null) / Number('') are 0 — guard first
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/**
 * Every game the room can ever show: published this year or later, and actually scored.
 *
 * The year floor is computed from the client clock rather than baked in, and the
 * `predicted_geek_rating IS NOT NULL` guard matters because the catalog LEFT JOINs
 * predictions — an unscored upcoming game is a real row with five null model columns, and
 * it would sort to the bottom of every column as a blank rather than being absent.
 */
export function upcomingWhere(): string {
	return `year_published >= ${new Date().getFullYear()} AND predicted_geek_rating IS NOT NULL`;
}

/** Compile the scope to a SQL WHERE body (without the `WHERE` keyword). */
export function toWhere(scope: PredictionScope): string {
	const parts: string[] = [upcomingWhere()];
	if (scope.year != null) parts.push(`year_published = ${scope.year}`);
	// Bands are half-open [min, max) so a 3.0 game lands in Medium-Heavy and nowhere else —
	// the same rule Discover's COMPLEXITY_BANDS documents.
	if (scope.weightMin != null) parts.push(`predicted_complexity >= ${scope.weightMin}`);
	if (scope.weightMax != null) parts.push(`predicted_complexity < ${scope.weightMax}`);
	if (scope.players != null)
		parts.push(`min_players <= ${scope.players} AND max_players >= ${scope.players}`);
	for (const c of scope.categories) parts.push(`list_contains(categories, '${esc(c)}')`);
	for (const m of scope.mechanics) parts.push(`list_contains(mechanics, '${esc(m)}')`);
	// OR within an entity ("by A or B"), AND across entities — as Explore does.
	const entity = (col: string, sels: string[]) => {
		if (sels.length)
			parts.push('(' + sels.map((v) => `list_contains(${col}, '${esc(v)}')`).join(' OR ') + ')');
	};
	entity('designers', scope.designers);
	entity('publishers', scope.publishers);
	if (scope.minHurdle != null && scope.minHurdle > 0)
		parts.push(`predicted_hurdle_prob >= ${scope.minHurdle}`);
	return parts.join(' AND ');
}

/**
 * The year alone, with every user filter dropped — the backdrop the count line compares
 * against, so "1,204 of 4,347" states what the filters actually did.
 */
export function yearWhere(scope: PredictionScope): string {
	return toWhere({ ...DEFAULT_PREDICTION_SCOPE, minHurdle: null, year: scope.year });
}

/** `ORDER BY` body. `game_id` breaks ties so paging is stable across identical values. */
export function toOrderBy(scope: PredictionScope): string {
	const col = SORT_COLUMNS[scope.sort] ?? SORT_COLUMNS.geek;
	return `${col.sql} ${scope.desc ? 'DESC' : 'ASC'} NULLS LAST, game_id`;
}

/** Which band, if any, the current bounds correspond to. */
export function activeBand(scope: PredictionScope): ComplexityBand | null {
	return (
		COMPLEXITY_BANDS.find((b) => b.min === scope.weightMin && b.max === scope.weightMax) ?? null
	);
}

/** Single-select: apply the band, or clear it if it is already active. */
export function bandPatch(scope: PredictionScope, band: ComplexityBand): Partial<PredictionScope> {
	if (activeBand(scope)?.label === band.label) return { weightMin: null, weightMax: null };
	return { weightMin: band.min, weightMax: band.max };
}

/**
 * Active filters as removable chips. The year is deliberately absent: it is a dial with no
 * "off" position, so a chip that cleared it would leave the page with no population.
 * `minHurdle` IS a chip even though it has a non-zero default — a filter that silently
 * removes ~3,000 games should be visible and removable.
 */
export interface FilterChip {
	id: string;
	kind: string;
	label: string;
	patch: Partial<PredictionScope>;
}

export function activeFilters(scope: PredictionScope): FilterChip[] {
	const chips: FilterChip[] = [];
	const band = activeBand(scope);
	if (band)
		chips.push({
			id: 'weight',
			kind: 'complexity',
			label: band.label,
			patch: { weightMin: null, weightMax: null }
		});
	if (scope.players != null)
		chips.push({
			id: 'players',
			kind: 'plays with',
			label: `${scope.players}${scope.players >= 6 ? '+' : ''}`,
			patch: { players: null }
		});
	const values = (
		key: 'categories' | 'mechanics' | 'designers' | 'publishers',
		kind: string
	) => {
		for (const v of scope[key])
			chips.push({
				id: `${key}:${v}`,
				kind,
				label: v,
				patch: { [key]: scope[key].filter((x) => x !== v) } as Partial<PredictionScope>
			});
	};
	values('categories', 'category');
	values('mechanics', 'mechanic');
	values('designers', 'designer');
	values('publishers', 'publisher');
	if (scope.minHurdle != null && scope.minHurdle > 0)
		chips.push({
			id: 'hurdle',
			kind: 'likely rated',
			label: `≥ ${Math.round(scope.minHurdle * 100)}%`,
			patch: { minHurdle: null }
		});
	return chips;
}

/** Serialize to URLSearchParams — only non-default values, for clean shareable URLs. */
export function scopeToParams(scope: PredictionScope): URLSearchParams {
	const p = new URLSearchParams();
	if (scope.year != null) p.set('year', String(scope.year));
	if (scope.weightMin != null) p.set('wmin', String(scope.weightMin));
	if (scope.weightMax != null) p.set('wmax', String(scope.weightMax));
	if (scope.players != null) p.set('p', String(scope.players));
	if (scope.categories.length) p.set('cats', scope.categories.join(','));
	if (scope.mechanics.length) p.set('mechs', scope.mechanics.join(','));
	// Entity names can contain commas, so repeated params rather than a joined list.
	for (const d of scope.designers) p.append('des', d);
	for (const pub of scope.publishers) p.append('pub', pub);
	// `0` is meaningful (an explicitly cleared floor) and must round-trip, so compare to the
	// default rather than testing truthiness.
	if (scope.minHurdle !== DEFAULT_MIN_HURDLE) p.set('h', String(scope.minHurdle ?? 0));
	if (scope.sort !== 'geek') p.set('sort', scope.sort);
	if (!scope.desc) p.set('dir', 'asc');
	return p;
}

/** Parse a scope back from URLSearchParams, falling back to defaults. */
export function scopeFromParams(params: URLSearchParams): PredictionScope {
	const list = (key: string) =>
		(params.get(key) ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	const sort = params.get('sort');
	const h = params.get('h');
	return {
		year: finite(params.get('year')),
		weightMin: finite(params.get('wmin')),
		weightMax: finite(params.get('wmax')),
		players: finite(params.get('p')),
		categories: list('cats'),
		mechanics: list('mechs'),
		designers: params.getAll('des'),
		publishers: params.getAll('pub'),
		minHurdle: h == null ? DEFAULT_MIN_HURDLE : (finite(h) ?? 0),
		sort: sort != null && sort in SORT_COLUMNS ? (sort as SortKey) : 'geek',
		desc: params.get('dir') !== 'asc'
	};
}
