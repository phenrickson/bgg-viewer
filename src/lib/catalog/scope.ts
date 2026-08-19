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
export interface ComplexityBand {
	label: string;
	/** Inclusive lower bound; null = open. */
	min: number | null;
	/** Exclusive upper bound; null = open. */
	max: number | null;
}

/**
 * The 1–5 weight scale, banded into words — the vocabulary people actually use for complexity.
 *
 * Half-open intervals, and a boundary belongs to the UPPER band: a 3.0 game is Medium-Heavy,
 * not Medium. One rule applied consistently, so no game lands in two bands and none falls
 * between them. The first band has no floor and the last no ceiling, so the five cover the
 * whole scale.
 *
 * Lives here rather than in `discover/` because `toWhere` needs the cutoffs and `dials.ts`
 * already imports from this module; it re-exports these for Discover's existing callers.
 */
export const COMPLEXITY_BANDS: ComplexityBand[] = [
	{ label: 'Light', min: null, max: 2.0 },
	{ label: 'Medium-Light', min: 2.0, max: 2.5 },
	{ label: 'Medium', min: 2.5, max: 3.0 },
	{ label: 'Medium-Heavy', min: 3.0, max: 3.5 },
	{ label: 'Heavy', min: 3.5, max: null }
];

/** 1-indexed band number → its definition, or undefined if the index names no band. */
export const bandAt = (i: number): ComplexityBand | undefined => COMPLEXITY_BANDS[i - 1];

/**
 * Find the band index for a given weight. Returns 0 if null or non-finite;
 * use the return value to determine whether to render a badge/meter at all (0 = none).
 *
 * Lives here rather than in `discover/dials.ts` because `ComplexityMeter` (a shared
 * encoding used by both Discover and Explore) needs it too; `dials.ts` re-exports it
 * for its existing callers.
 */
export function complexityBandIndex(weight: number | null): number {
	if (weight == null || !Number.isFinite(weight)) return 0;
	for (let i = 0; i < COMPLEXITY_BANDS.length; i++) {
		const b = COMPLEXITY_BANDS[i];
		const aboveMin = b.min == null || weight >= b.min;
		const belowMax = b.max == null || weight < b.max;
		if (aboveMin && belowMax) return i + 1; // 1-indexed: 1..5 for bands, 0 for null/invalid
	}
	return COMPLEXITY_BANDS.length; // Fallback to last band (index 4 → return 5)
}

export interface Scope {
	q: string;
	yearMin: number | null;
	yearMax: number | null;
	weightMin: number | null;
	weightMax: number | null;
	/**
	 * Complexity as named bands (1-indexed into `COMPLEXITY_BANDS`), OR-ed together like the
	 * facet lists — so "Light or Heavy, nothing in between" is expressible, which the
	 * `weightMin`/`weightMax` span above cannot represent.
	 *
	 * Additive to that span, not a replacement: the shape strip still brushes a free range, and
	 * the two AND together like any other pair of filters.
	 */
	weightBands: number[];
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
	/**
	 * Geek-rating window. Every other numeric bound here is a min/max pair; this one was a
	 * floor only, which made "well regarded but outside the famous tier" — a rank band —
	 * inexpressible. `geek_rating` has no rank column to filter on, so a band is stated as its
	 * rating cutoffs.
	 */
	geekMin: number | null;
	geekMax: number | null;
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
	/**
	 * Base population (the "Universe"). Two rated slices, plus `upcoming` — games published
	 * this year or later, which have no ratings to slice by.
	 *
	 * `upcoming` is not just a third `WHERE`: it also **repoints the numeric filters at the
	 * predicted columns**. A game nobody has played has no `average_weight`, `geek_rating`,
	 * `average_rating` or `users_rated`, but it has a model estimate of all four — so
	 * "complexity 3.0–3.5" is the same question in both universes and only the column
	 * differs. That is what lets one `Scope`, one rail and one table serve both rooms
	 * instead of two of each drifting apart.
	 */
	universe: 'top10k' | 'rated' | 'upcoming';
	/**
	 * Floor on `predicted_hurdle_prob` — the chance a game ever gathers enough ratings to
	 * earn a geek rating. Only meaningful in the `upcoming` universe (elsewhere the games
	 * have already cleared it), and ignored by `toWhere` outside it.
	 */
	hurdleMin: number | null;
}

/**
 * Which column each numeric filter compiles to, per universe. The rated universes read what
 * happened; `upcoming` reads what the model expects.
 */
const COLUMNS = {
	rated: {
		weight: 'average_weight',
		rating: 'average_rating',
		usersRated: 'users_rated',
		geek: 'geek_rating'
	},
	upcoming: {
		weight: 'predicted_complexity',
		rating: 'predicted_rating',
		usersRated: 'predicted_users_rated',
		geek: 'predicted_geek_rating'
	}
} as const;

export function columnsFor(universe: Scope['universe']) {
	return universe === 'upcoming' ? COLUMNS.upcoming : COLUMNS.rated;
}

/**
 * The default hurdle floor for the upcoming universe. Most BGG entries never gather enough
 * ratings to earn a geek rating, and without a floor the tail of placeholder records crowds
 * the list. Surfaced as a control and as a chip, so it is visible rather than assumed.
 */
export const DEFAULT_HURDLE_MIN = 0.25;

export const DEFAULT_SCOPE: Scope = {
	q: '',
	yearMin: null,
	yearMax: null,
	weightMin: null,
	weightMax: null,
	weightBands: [],
	ratingMin: null,
	ratingMax: null,
	usersRatedMin: null,
	usersRatedMax: null,
	geekMin: null,
	geekMax: null,
	players: null,
	bestAt: null,
	categories: [],
	mechanics: [],
	designers: [],
	artists: [],
	publishers: [],
	families: [],
	universe: 'top10k',
	hurdleMin: null
};

const esc = (s: string) => s.replace(/'/g, "''");
const finite = (v: unknown): number | null => {
	if (v == null || v === '') return null; // Number(null) / Number('') are 0 — guard first
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/** Which question the rail's player-count row is asking. */
export type PlayerCountMode = 'players' | 'bestAt';

/**
 * The player-count row writes one field and clears the other.
 *
 * `players` ("the box plays at N") and `bestAt` ("the community voted N best") remain two
 * separate fields — `toWhere` still ANDs both, so a hand-written `?p=2&best=4` URL filters on
 * both. What's constrained is the *UI*: one row of numbers can only mean one thing at a time,
 * and letting a stale filter of the other kind stand would make the rail and the shape strip
 * disagree about what's filtered. Returning a patch (rather than mutating) keeps this pure and
 * testable, and matches how `activeChips` hands back `patch` objects.
 *
 * Re-picking the lit number clears it, like the universe and hurdle rows.
 */
export function setPlayerCount(
	scope: Scope,
	mode: PlayerCountMode,
	n: number | null
): Pick<Scope, 'players' | 'bestAt'> {
	const cleared = n != null && scope[mode] === n ? null : n;
	return mode === 'players'
		? { players: cleared, bestAt: null }
		: { players: null, bestAt: cleared };
}

/**
 * The mode the rail should show for a given scope: whichever field is set, preferring
 * `bestAt`. Derived rather than remembered so a shared `?best=4` link lands on Best-at, and a
 * strip click (which sets `bestAt`) flips the rail's toggle on its own. Independent mode state
 * would default to Plays-with while a best-at filter was silently active.
 */
export function playerCountModeFor(scope: Scope): PlayerCountMode {
	return scope.bestAt != null ? 'bestAt' : 'players';
}

/**
 * Step the year filter by `delta` years, **shifting the whole window**.
 *
 * The point of the control is to walk: see 2019, then 2020, then 2021, with every other filter
 * held still. Neither the strip's brush (a drag across ~58 bins, imprecise for landing on one
 * year) nor a typed from/to pair can do that without re-specifying the filter each time.
 *
 * Shifting rather than collapsing is what makes one rule cover both cases. On a single year it
 * walks a year at a time; on a brushed span it slides the window and keeps its width ("same
 * breadth, later"). The alternatives both punish you for having used the strip — collapsing
 * destroys a range you deliberately set, and disabling kills the control exactly when you
 * reach for it. Here there is no mode to be in and nothing is discarded.
 *
 * With nothing set, the first step lands on `from` — there is no "current year" to move.
 */
export function stepYear(
	scope: Scope,
	delta: number,
	bounds: { lo: number; hi: number },
	from: number
): Pick<Scope, 'yearMin' | 'yearMax'> {
	const clamp = (n: number) => Math.min(bounds.hi, Math.max(bounds.lo, n));
	if (scope.yearMin == null && scope.yearMax == null) {
		const y = clamp(from);
		return { yearMin: y, yearMax: y };
	}
	// A half-open range (only one bound set) steps that bound and stays half-open, so "1990
	// onward" walks its floor rather than silently gaining a ceiling.
	if (scope.yearMin == null) return { yearMin: null, yearMax: clamp(scope.yearMax! + delta) };
	if (scope.yearMax == null) return { yearMin: clamp(scope.yearMin + delta), yearMax: null };
	// Both set: shift together. Clamping the *window* rather than each bound keeps the span's
	// width — clamping the ends independently would squash a 2020–2025 range against the top
	// edge instead of just stopping it.
	const width = scope.yearMax - scope.yearMin;
	const lo = Math.min(bounds.hi - width, Math.max(bounds.lo, scope.yearMin + delta));
	return { yearMin: lo, yearMax: lo + width };
}

/** Compile the scope to a SQL WHERE body (without the `WHERE` keyword). */
export function toWhere(scope: Scope): string {
	const parts: string[] = [];
	const col = columnsFor(scope.universe);
	if (scope.universe === 'upcoming')
		// Published this year or later. The `IS NOT NULL` guard matters because the catalog
		// LEFT JOINs predictions: an unscored upcoming game is a real row with five null model
		// columns, and it would sit in every sort as a blank rather than being absent.
		parts.push(
			`year_published >= ${new Date().getFullYear()} AND predicted_geek_rating IS NOT NULL`
		);
	else if (scope.universe === 'rated') parts.push('users_rated >= 30');
	else
		// Top 10k by geek rating — an independent subquery over the whole catalog.
		parts.push(
			'game_id IN (SELECT game_id FROM catalog WHERE geek_rating > 0 ORDER BY geek_rating DESC LIMIT 10000)'
		);
	if (scope.yearMin != null) parts.push(`year_published >= ${scope.yearMin}`);
	if (scope.yearMax != null) parts.push(`year_published <= ${scope.yearMax}`);
	// Numeric bounds compile against whichever columns this universe reads — actuals for the
	// rated slices, model estimates for upcoming. Same question, different source.
	if (scope.weightMin != null) parts.push(`${col.weight} >= ${scope.weightMin}`);
	if (scope.weightMax != null) parts.push(`${col.weight} <= ${scope.weightMax}`);
	// Bands OR together, like the facet lists: checking Light and Heavy really does mean "either
	// end, nothing in between". Half-open per band (`>= min AND < max`) so boundaries can't
	// double-count; the outer bands omit the bound they don't have.
	if (scope.weightBands.length) {
		const clauses = scope.weightBands
			.map(bandAt)
			.filter((b): b is ComplexityBand => b != null)
			.map((b) =>
				b.min == null
					? `${col.weight} < ${b.max}`
					: b.max == null
						? `${col.weight} >= ${b.min}`
						: `(${col.weight} >= ${b.min} AND ${col.weight} < ${b.max})`
			);
		if (clauses.length)
			parts.push(clauses.length > 1 ? `(${clauses.join(' OR ')})` : clauses[0]);
	}
	if (scope.ratingMin != null) parts.push(`${col.rating} >= ${scope.ratingMin}`);
	if (scope.ratingMax != null) parts.push(`${col.rating} <= ${scope.ratingMax}`);
	if (scope.usersRatedMin != null) parts.push(`${col.usersRated} >= ${scope.usersRatedMin}`);
	if (scope.usersRatedMax != null) parts.push(`${col.usersRated} <= ${scope.usersRatedMax}`);
	if (scope.geekMin != null) parts.push(`${col.geek} >= ${scope.geekMin}`);
	if (scope.geekMax != null) parts.push(`${col.geek} <= ${scope.geekMax}`);
	// Only the upcoming universe has a hurdle to clear; elsewhere every game already did.
	if (scope.universe === 'upcoming' && scope.hurdleMin != null && scope.hurdleMin > 0)
		parts.push(`predicted_hurdle_prob >= ${scope.hurdleMin}`);
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
	// One chip per band, like the facet values — clearing "Heavy" leaves "Light" standing rather
	// than wiping the whole complexity selection.
	for (const i of scope.weightBands) {
		const band = bandAt(i);
		if (!band) continue;
		chips.push({
			id: `weightBand:${i}`,
			kind: 'complexity',
			label: band.label,
			patch: { weightBands: scope.weightBands.filter((b) => b !== i) }
		});
	}
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
	// Through `range` like every other numeric pair, so a window reads "6.28–6.67" and — more
	// importantly — clearing the chip clears BOTH bounds. The old bespoke block handled only
	// `geekMin`, so a max would have filtered the set with no chip able to remove it.
	range('geek', 'geek', scope.geekMin, scope.geekMax, 'geekMin', 'geekMax', exact);
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
	// A chip despite having a non-zero default in the upcoming universe: a filter that
	// silently removes ~3,000 games has to be visible and removable.
	if (scope.universe === 'upcoming' && scope.hurdleMin != null && scope.hurdleMin > 0)
		chips.push({
			id: 'hurdle',
			kind: 'likely rated',
			label: `≥ ${Math.round(scope.hurdleMin * 100)}%`,
			patch: { hurdleMin: null }
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
	// Indices, not labels: short URLs that survive relabelling a band.
	if (scope.weightBands.length) p.set('wband', [...scope.weightBands].sort().join(','));
	if (scope.ratingMin != null) p.set('rmin', String(scope.ratingMin));
	if (scope.ratingMax != null) p.set('rmax', String(scope.ratingMax));
	if (scope.usersRatedMin != null) p.set('urmin', String(scope.usersRatedMin));
	if (scope.usersRatedMax != null) p.set('urmax', String(scope.usersRatedMax));
	if (scope.geekMin != null) p.set('gmin', String(scope.geekMin));
	if (scope.geekMax != null) p.set('gmax', String(scope.geekMax));
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
	// `0` is meaningful (an explicitly cleared floor) and must round-trip, so this compares
	// against the universe's default rather than testing truthiness.
	if (scope.hurdleMin !== defaultHurdleFor(scope.universe))
		p.set('h', String(scope.hurdleMin ?? 0));
	return p;
}

/** The hurdle floor a universe starts at. Only `upcoming` has one. */
export function defaultHurdleFor(universe: Scope['universe']): number | null {
	return universe === 'upcoming' ? DEFAULT_HURDLE_MIN : null;
}

/** Parse a scope back from URLSearchParams, falling back to defaults. */
export function scopeFromParams(params: URLSearchParams): Scope {
	const list = (key: string) =>
		(params.get(key) ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	/**
	 * Band indices — deduped, sorted, and dropped unless they name a real band, so a
	 * hand-written `?wband=9,foo,2,2` can't put junk in the scope or a phantom chip in the
	 * header.
	 */
	const bandList = (raw: string | null) => {
		const seen = new Set<number>();
		for (const s of (raw ?? '').split(',')) {
			const n = Number(s.trim());
			if (Number.isInteger(n) && bandAt(n)) seen.add(n);
		}
		return [...seen].sort();
	};
	const u = params.get('u');
	const h = params.get('h');
	return {
		q: params.get('q') ?? '',
		yearMin: finite(params.get('ymin')),
		yearMax: finite(params.get('ymax')),
		weightMin: finite(params.get('wmin')),
		weightMax: finite(params.get('wmax')),
		weightBands: bandList(params.get('wband')),
		ratingMin: finite(params.get('rmin')),
		ratingMax: finite(params.get('rmax')),
		usersRatedMin: finite(params.get('urmin')),
		usersRatedMax: finite(params.get('urmax')),
		geekMin: finite(params.get('gmin')),
		geekMax: finite(params.get('gmax')),
		players: finite(params.get('p')),
		bestAt: finite(params.get('best')),
		categories: list('cats'),
		mechanics: list('mechs'),
		designers: params.getAll('des'),
		artists: params.getAll('art'),
		publishers: params.getAll('pub'),
		families: params.getAll('fam'),
		universe: u === 'rated' || u === 'upcoming' ? u : 'top10k',
		hurdleMin: h == null ? defaultHurdleFor(u === 'upcoming' ? 'upcoming' : 'top10k') : finite(h)
	};
}
