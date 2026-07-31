/**
 * The Explore scope — which games are in view. One source of truth that (de)serializes
 * to the URL (shareable, reload-safe) and compiles to a SQL WHERE clause the in-browser
 * DuckDB runs. Numeric bounds are coerced to finite numbers; string facets/search are
 * escaped, so the compiled SQL is injection-safe.
 *
 * `players` and `bestAt` are different questions and both are answerable here: `players`
 * asks whether the box supports N (min/max), while `bestAt` asks whether the community
 * voted N *best* — `best_player_counts` is in the artifact, so the flagship filter needs
 * no live module.
 */
export interface Scope {
	q: string;
	yearMin: number | null;
	yearMax: number | null;
	weightMin: number | null;
	weightMax: number | null;
	/** Average-rating window. Brushed directly on the shape strip's rating histogram. */
	ratingMin: number | null;
	ratingMax: number | null;
	/**
	 * How many people have rated it — `users_rated`, BGG's "Ratings" count. Deliberately not
	 * named `ratingsMin`: one character from `ratingMin` above, which means something
	 * completely different (how highly it's rated, not how widely it's known).
	 */
	usersRatedMin: number | null;
	usersRatedMax: number | null;
	geekMin: number | null;
	players: number | null;
	/** Community "best at N players" — the flagship filter BGG can't do. */
	bestAt: number | null;
	categories: string[];
	mechanics: string[];
	/** High-cardinality entity filters, chosen via type-ahead. OR within each entity. */
	designers: string[];
	artists: string[];
	publishers: string[];
	families: string[];
	/** Base population (the "Universe"): top 10k by geek rating, or everything rated. */
	universe: 'top10k' | 'rated';
}

export const DEFAULT_SCOPE: Scope = {
	q: '',
	yearMin: null,
	yearMax: null,
	weightMin: null,
	weightMax: null,
	ratingMin: null,
	ratingMax: null,
	usersRatedMin: null,
	usersRatedMax: null,
	geekMin: null,
	players: null,
	bestAt: null,
	categories: [],
	mechanics: [],
	designers: [],
	artists: [],
	publishers: [],
	families: [],
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
	if (scope.ratingMin != null) parts.push(`average_rating >= ${scope.ratingMin}`);
	if (scope.ratingMax != null) parts.push(`average_rating <= ${scope.ratingMax}`);
	if (scope.usersRatedMin != null) parts.push(`users_rated >= ${scope.usersRatedMin}`);
	if (scope.usersRatedMax != null) parts.push(`users_rated <= ${scope.usersRatedMax}`);
	if (scope.geekMin != null) parts.push(`geek_rating >= ${scope.geekMin}`);
	if (scope.players != null)
		parts.push(`min_players <= ${scope.players} AND max_players >= ${scope.players}`);
	if (scope.bestAt != null) parts.push(`list_contains(best_player_counts, ${scope.bestAt})`);
	for (const c of scope.categories) parts.push(`list_contains(categories, '${esc(c)}')`);
	for (const m of scope.mechanics) parts.push(`list_contains(mechanics, '${esc(m)}')`);
	// High-cardinality entity filters: OR within an entity ("by A or B"), AND across.
	const entity = (col: string, sels: string[]) => {
		if (sels.length)
			parts.push('(' + sels.map((v) => `list_contains(${col}, '${esc(v)}')`).join(' OR ') + ')');
	};
	entity('designers', scope.designers);
	entity('artists', scope.artists);
	entity('publishers', scope.publishers);
	entity('families', scope.families);
	const q = scope.q.trim().toLowerCase();
	if (q.length >= 2) parts.push(`lower(name) LIKE '%${esc(q)}%'`);
	return parts.length ? parts.join(' AND ') : 'TRUE';
}

/**
 * The universe alone, with every user filter dropped — the *backdrop* set. The shape
 * strip draws each distribution twice: this population in muted grey behind the current
 * scope in colour, so a filter reads as "which slice of the whole did I just take" and
 * the axis never shifts under the brush as you drag.
 */
export function universeWhere(scope: Scope): string {
	return toWhere({ ...DEFAULT_SCOPE, universe: scope.universe });
}

/**
 * The active filters as removable chips — the canvas header's "what have I done to this
 * set" bar. One chip per *value* (each category is its own chip), each carrying the patch
 * that removes just it, so undoing one constraint never disturbs the others. The universe
 * is deliberately absent: it's a dial, not a filter, and can't be cleared to nothing.
 */
export interface FilterChip {
	id: string;
	/** Which control this came from — the chip's dim prefix, e.g. "best at". */
	kind: string;
	label: string;
	patch: Partial<Scope>;
}

/**
 * Ratings counts span 30 to ~130,000, so a chip reading "12,500+" is noise where "12.5k+"
 * is a fact you can take in at a glance. Kept exact below 1,000, where every digit matters.
 */
export function compactCount(n: number): string {
	if (Math.abs(n) < 1000) return String(Math.round(n));
	const k = n / 1000;
	return `${Math.round(k * 10) / 10}k`.replace('.0k', 'k');
}

/**
 * Snap a ratings count to a value someone would actually type: 1, 1.5, 2, 3, 5 or 7 × a power
 * of ten. A log-scaled brush lands on arbitrary numbers — nobody wants "at least 1,259
 * ratings", they want "at least 1,500" — and the snap is visible, because the histogram's
 * selection edge redraws where the filter really sits.
 *
 * The 1.5 step is deliberate. With ten bins per decade the brush resolves ~26% steps, so a
 * bare 1-2-3-5-7 ladder would leave the 1→2 gap coarser than the gesture: drags that visibly
 * moved would snap back to the same number.
 */
export function niceCount(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 0;
	const exp = Math.floor(Math.log10(n));
	const pow = Math.pow(10, exp);
	const mantissa = n / pow;
	const steps = [1, 1.5, 2, 3, 5, 7, 10];
	let best = steps[0];
	for (const s of steps) if (Math.abs(s - mantissa) < Math.abs(best - mantissa)) best = s;
	return Math.round(best * pow);
}

export function activeFilters(scope: Scope): FilterChip[] {
	const chips: FilterChip[] = [];
	const range = (
		id: string,
		kind: string,
		min: number | null,
		max: number | null,
		minKey: keyof Scope,
		maxKey: keyof Scope,
		fmt: (n: number) => string = String
	) => {
		if (min == null && max == null) return;
		const label =
			min != null && max != null
				? `${fmt(min)}–${fmt(max)}`
				: min != null
					? `${fmt(min)}+`
					: `up to ${fmt(max!)}`;
		chips.push({ id, kind, label, patch: { [minKey]: null, [maxKey]: null } as Partial<Scope> });
	};

	if (scope.q) chips.push({ id: 'q', kind: 'name', label: `“${scope.q}”`, patch: { q: '' } });
	range('year', 'year', scope.yearMin, scope.yearMax, 'yearMin', 'yearMax');
	// Show the bound that is actually applied. Rounding 3.25 to "3.3" would have the chip
	// contradict the filter — and the shape strip brushes in quarter steps.
	const exact = (n: number) => String(Math.round(n * 100) / 100);
	range('weight', 'complexity', scope.weightMin, scope.weightMax, 'weightMin', 'weightMax', exact);
	range('rating', 'rating', scope.ratingMin, scope.ratingMax, 'ratingMin', 'ratingMax', exact);
	range(
		'usersRated',
		'ratings',
		scope.usersRatedMin,
		scope.usersRatedMax,
		'usersRatedMin',
		'usersRatedMax',
		compactCount
	);
	if (scope.geekMin != null)
		chips.push({
			id: 'geek',
			kind: 'geek',
			label: `${exact(scope.geekMin)}+`,
			patch: { geekMin: null }
		});
	if (scope.players != null)
		chips.push({
			id: 'players',
			kind: 'plays with',
			label: `${scope.players}${scope.players >= 6 ? '+' : ''}`,
			patch: { players: null }
		});
	if (scope.bestAt != null)
		chips.push({
			id: 'bestAt',
			kind: 'best at',
			label: `${scope.bestAt}`,
			patch: { bestAt: null }
		});

	const values = (key: 'categories' | 'mechanics' | 'designers' | 'artists' | 'publishers' | 'families', kind: string) => {
		for (const v of scope[key])
			chips.push({
				id: `${key}:${v}`,
				kind,
				label: v,
				patch: { [key]: scope[key].filter((x) => x !== v) } as Partial<Scope>
			});
	};
	values('categories', 'category');
	values('mechanics', 'mechanic');
	values('designers', 'designer');
	values('artists', 'artist');
	values('publishers', 'publisher');
	values('families', 'family');
	return chips;
}

/** Serialize to URLSearchParams — only non-default values, for clean shareable URLs. */
export function scopeToParams(scope: Scope): URLSearchParams {
	const p = new URLSearchParams();
	if (scope.q) p.set('q', scope.q);
	if (scope.yearMin != null) p.set('ymin', String(scope.yearMin));
	if (scope.yearMax != null) p.set('ymax', String(scope.yearMax));
	if (scope.weightMin != null) p.set('wmin', String(scope.weightMin));
	if (scope.weightMax != null) p.set('wmax', String(scope.weightMax));
	if (scope.ratingMin != null) p.set('rmin', String(scope.ratingMin));
	if (scope.ratingMax != null) p.set('rmax', String(scope.ratingMax));
	if (scope.usersRatedMin != null) p.set('urmin', String(scope.usersRatedMin));
	if (scope.usersRatedMax != null) p.set('urmax', String(scope.usersRatedMax));
	if (scope.geekMin != null) p.set('gmin', String(scope.geekMin));
	if (scope.players != null) p.set('p', String(scope.players));
	if (scope.bestAt != null) p.set('best', String(scope.bestAt));
	if (scope.categories.length) p.set('cats', scope.categories.join(','));
	if (scope.mechanics.length) p.set('mechs', scope.mechanics.join(','));
	// Entity names can contain commas, so use repeated params, not a joined list.
	for (const d of scope.designers) p.append('des', d);
	for (const a of scope.artists) p.append('art', a);
	for (const pub of scope.publishers) p.append('pub', pub);
	for (const f of scope.families) p.append('fam', f);
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
		ratingMin: finite(params.get('rmin')),
		ratingMax: finite(params.get('rmax')),
		usersRatedMin: finite(params.get('urmin')),
		usersRatedMax: finite(params.get('urmax')),
		geekMin: finite(params.get('gmin')),
		players: finite(params.get('p')),
		bestAt: finite(params.get('best')),
		categories: list('cats'),
		mechanics: list('mechs'),
		designers: params.getAll('des'),
		artists: params.getAll('art'),
		publishers: params.getAll('pub'),
		families: params.getAll('fam'),
		universe: params.get('u') === 'rated' ? 'rated' : 'top10k'
	};
}
