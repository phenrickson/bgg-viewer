import { error } from '@sveltejs/kit';
import { warehouseClient, GameNotFoundError, type GameDocument } from '$lib/server/warehouse';
import { isOffline } from '$lib/server/offline';
import type { PageServerLoad } from './$types';

/** The subset of `features` this page reads — the raw bag is otherwise untyped. */
interface Features {
	name: string;
	year_published: number | null;
	designers: string[] | null;
	artists: string[] | null;
	publishers: string[] | null;
	categories: string[] | null;
	mechanics: string[] | null;
	families: string[] | null;
	min_players: number | null;
	max_players: number | null;
	min_playtime: number | null;
	max_playtime: number | null;
	min_age: number | null;
	geek_rating: number | null;
	average_rating: number | null;
	users_rated: number | null;
	average_weight: number | null;
	/** How many people rated the complexity — a 1-vote weight and a 2,716-vote weight are
	 *  not the same claim, and the page showed them identically. */
	num_weights: number | null;
	image: string | null;
	thumbnail: string | null;
	description: string | null;
	player_counts: Array<Record<string, number | string>>;
	/** When the warehouse last refreshed this game. Ratings move; the page should say when. */
	last_updated: string | null;
}

interface SimilarRow {
	game_id: number;
	name: string;
	year_published: number | null;
	distance: number;
}

/**
 * The five model outputs, plus who produced each. `bgg_predictions` is year-filtered, so a
 * missing row means "outside the scoring window", not "the model declined to guess".
 *
 * The hurdle is the gate: BGG holds ~140k games and only ~30k of them ever accumulate enough
 * ratings to earn a geek rating, so `predicted_hurdle_prob` is P(this game gets one at all).
 * The other four are what to expect *if* it does — which is why they render subordinate to it.
 */
const TARGETS = ['hurdle', 'geek_rating', 'rating', 'complexity', 'users_rated'] as const;

function toPredictions(raw: Record<string, unknown> | null) {
	if (!raw) return null;
	const n = (k: string) => {
		const v = Number(raw[k]);
		return Number.isFinite(v) ? v : null;
	};
	// Model *versions* arrive as numbers, not strings — a `typeof === 'string'` guard silently
	// dropped every one of them, which is how the first render attributed five models by name
	// and no version at all.
	const s = (k: string) => {
		const v = raw[k];
		return v == null || v === '' ? null : String(v);
	};

	// One model per target, each its own name and version. They don't collapse to a single
	// line, so the page discloses them rather than pretending there's one "the model".
	const models = TARGETS.map((t) => ({
		target: t,
		name: s(`${t}_model_name`),
		version: s(`${t}_model_version`),
		experiment: s(`${t}_experiment`)
	})).filter((m) => m.name);

	return {
		hurdle: n('predicted_hurdle_prob'),
		geek: n('predicted_geek_rating'),
		rating: n('predicted_rating'),
		complexity: n('predicted_complexity'),
		usersRated: n('predicted_users_rated'),
		scoredAt: s('score_ts'),
		firstScoredAt: s('first_prediction_ts'),
		// NULL is "not scored since the flag existed", not "out of sample" — those rows
		// self-heal through change detection, so the page says nothing rather than guessing.
		sampleStatus: s('sample_status'),
		trainingCutoff: n('training_cutoff_year'),
		models
	};
}

function toViewModel(doc: GameDocument) {
	const f = doc.features as unknown as Features;
	// `player_count` is a string, and the warehouse orders by it as one — so a game with more
	// than nine supported counts listed them 1, 10, 11 … 19, 2, 20 … 3, 30, 30+, 4, 5, 6. Sort
	// numerically here, with the open-ended "30+" bucket sitting just past its own number.
	const rank = (c: string) => {
		const n = parseInt(c, 10);
		if (!Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
		return c.includes('+') ? n + 0.5 : n;
	};
	const pcts = (f.player_counts ?? [])
		.slice()
		.sort((a, b) => rank(String(a.player_count)) - rank(String(b.player_count)))
		.map((p) => {
			const best = Number(p.best_percentage) || 0;
			const rec = Number(p.recommended_percentage) || 0;
			return {
				count: String(p.player_count),
				best,
				recommended: rec,
				notRecommended: Math.max(0, 100 - best - rec),
				// A percentage is only as good as its sample: "4+" often rests on a couple of dozen
				// votes while "2" rests on thousands, and the bars alone can't tell you which.
				votes: Number(p.total_votes) || 0
			};
		});
	const bestAt = pcts.reduce<(typeof pcts)[number] | null>(
		(top, p) => (!top || p.best > top.best ? p : top),
		null
	);

	return {
		id: doc.game_id,
		name: f.name,
		year: f.year_published,
		image: f.image ?? f.thumbnail ?? null,
		description: f.description ?? null,
		designers: f.designers ?? [],
		artists: f.artists ?? [],
		publishers: f.publishers ?? [],
		categories: f.categories ?? [],
		mechanics: f.mechanics ?? [],
		families: f.families ?? [],
		minPlayers: f.min_players,
		maxPlayers: f.max_players,
		minTime: f.min_playtime,
		maxTime: f.max_playtime,
		minAge: f.min_age,
		geek: f.geek_rating,
		average: f.average_rating,
		ratings: f.users_rated,
		weight: f.average_weight,
		weightVotes: f.num_weights ?? null,
		lastUpdated: f.last_updated ?? null,
		playerCounts: pcts,
		bestAt: bestAt && bestAt.best > 0 ? bestAt.count : null,
		similar: (doc.similar as unknown as SimilarRow[]).map((s) => ({
			id: s.game_id,
			name: s.name,
			year: s.year_published,
			similarity: 1 - s.distance
		})),
		predictions: toPredictions(doc.predictions)
	};
}

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Not a valid game id.');

	// Offline: there is no warehouse to ask, so hand the browser the id and let it answer
	// from the catalog it already has in DuckDB. Returning `game: null` rather than throwing
	// is what gives the client a chance to render at all.
	if (isOffline()) return { game: null, id, offline: true as const };

	try {
		const game = toViewModel(await warehouseClient().getGame(id));
		return { game, id, offline: false as const };
	} catch (e) {
		if (e instanceof GameNotFoundError) throw error(404, `Game ${id} not found.`);
		throw e;
	}
};
