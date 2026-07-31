/**
 * Build a game profile from the catalog row the browser already holds, for offline mode.
 *
 * The catalog is narrow by design — it carries what you need to query games *as a set*, not
 * the full document. So this produces the same shape the page renders online, with the
 * warehouse-only fields absent: description, box art, playtime, min age, weight-vote counts,
 * per-count vote totals and percentages, similarity, and per-target model names/versions.
 * The page already guards every one of those, so they simply don't render.
 *
 * Kept separate from the query itself so it can be tested as a pure function, with no
 * DuckDB and no network.
 */

/** One catalog row, as DuckDB returns it. List columns arrive as arrays. */
export interface CatalogGameRow {
	game_id: number;
	name: string;
	year_published: number | null;
	geek_rating: number | null;
	average_rating: number | null;
	average_weight: number | null;
	users_rated: number | null;
	min_players: number | null;
	max_players: number | null;
	categories?: unknown;
	mechanics?: unknown;
	families?: unknown;
	designers?: unknown;
	artists?: unknown;
	publishers?: unknown;
	best_player_counts?: unknown;
	recommended_player_counts?: unknown;
	predicted_hurdle_prob?: unknown;
	predicted_geek_rating?: unknown;
	predicted_rating?: unknown;
	predicted_complexity?: unknown;
	predicted_users_rated?: unknown;
	sample_status?: unknown;
	training_cutoff_year?: unknown;
}

const num = (v: unknown): number | null => {
	if (v == null) return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/**
 * DuckDB hands back list columns as arrays, but Arrow-backed values can arrive as typed
 * arrays or Proxy-wrapped vectors rather than plain `Array`s, so normalize by iteration
 * rather than trusting `Array.isArray`.
 */
function toStrings(v: unknown): string[] {
	if (v == null) return [];
	const out: string[] = [];
	for (const item of v as Iterable<unknown>) {
		if (item == null) continue;
		const s = String(item).trim();
		if (s) out.push(s);
	}
	return out;
}

function toNumbers(v: unknown): number[] {
	if (v == null) return [];
	const out: number[] = [];
	for (const item of v as Iterable<unknown>) {
		const n = num(item);
		if (n != null) out.push(n);
	}
	return out;
}

/**
 * The catalog stores best/recommended counts as integer lists, where the page wants one row
 * per player count carrying both flags. Offline there are no vote totals or percentages, so
 * `best`/`recommended` are 100-or-0 markers of membership — enough for the "Best at" and
 * "Recommended at" labels, and `votes: 0` keeps the vote badge from rendering a false zero.
 */
function playerCounts(best: number[], recommended: number[]) {
	const all = [...new Set([...best, ...recommended])].sort((a, b) => a - b);
	return all.map((c) => ({
		count: String(c),
		best: best.includes(c) ? 100 : 0,
		recommended: recommended.includes(c) ? 100 : 0,
		notRecommended: 0,
		votes: 0
	}));
}

/**
 * Predictions come straight across — every one of them is already in the artifact. What's
 * missing is the provenance the warehouse carries: per-target model names and versions, and
 * the scoring timestamps. `models: []` keeps the disclosure block from rendering rather than
 * attributing the numbers to a model this row can't name.
 */
function predictions(row: CatalogGameRow) {
	const hurdle = num(row.predicted_hurdle_prob);
	const geek = num(row.predicted_geek_rating);
	const rating = num(row.predicted_rating);
	const complexity = num(row.predicted_complexity);
	const usersRated = num(row.predicted_users_rated);
	if (hurdle == null && geek == null && rating == null && complexity == null && usersRated == null) {
		return null;
	}
	const status = row.sample_status == null ? null : String(row.sample_status) || null;
	return {
		hurdle,
		geek,
		rating,
		complexity,
		usersRated,
		scoredAt: null,
		firstScoredAt: null,
		sampleStatus: status,
		trainingCutoff: num(row.training_cutoff_year),
		models: []
	};
}

export function gameFromCatalogRow(row: CatalogGameRow) {
	const pcts = playerCounts(
		toNumbers(row.best_player_counts),
		toNumbers(row.recommended_player_counts)
	);
	const bestAt = pcts.find((p) => p.best > 0) ?? null;

	return {
		id: row.game_id,
		name: row.name,
		year: num(row.year_published),
		// Warehouse-only, and guarded by the page: art, prose, timings, vote counts, freshness.
		image: null,
		description: null,
		minTime: null,
		maxTime: null,
		minAge: null,
		weightVotes: null,
		lastUpdated: null,
		similar: [],
		designers: toStrings(row.designers),
		artists: toStrings(row.artists),
		publishers: toStrings(row.publishers),
		categories: toStrings(row.categories),
		mechanics: toStrings(row.mechanics),
		families: toStrings(row.families),
		minPlayers: num(row.min_players),
		maxPlayers: num(row.max_players),
		geek: num(row.geek_rating),
		average: num(row.average_rating),
		ratings: num(row.users_rated),
		weight: num(row.average_weight),
		playerCounts: pcts,
		bestAt: bestAt ? bestAt.count : null,
		predictions: predictions(row)
	};
}

export type CatalogGame = ReturnType<typeof gameFromCatalogRow>;
