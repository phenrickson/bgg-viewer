import { error } from '@sveltejs/kit';
import { warehouseClient, GameNotFoundError, type GameDocument } from '$lib/server/warehouse';
import type { PageServerLoad } from './$types';

/** The subset of `features` this page reads — the raw bag is otherwise untyped. */
interface Features {
	name: string;
	year_published: number | null;
	designers: string[] | null;
	categories: string[] | null;
	mechanics: string[] | null;
	min_players: number | null;
	max_players: number | null;
	min_playtime: number | null;
	max_playtime: number | null;
	min_age: number | null;
	geek_rating: number | null;
	average_rating: number | null;
	users_rated: number | null;
	average_weight: number | null;
	player_counts: Array<Record<string, number | string>>;
}

interface SimilarRow {
	game_id: number;
	name: string;
	year_published: number | null;
	distance: number;
}

function toViewModel(doc: GameDocument) {
	const f = doc.features as unknown as Features;
	const pcts = (f.player_counts ?? []).map((p) => {
		const best = Number(p.best_percentage) || 0;
		const rec = Number(p.recommended_percentage) || 0;
		return {
			count: String(p.player_count),
			best,
			recommended: rec,
			notRecommended: Math.max(0, 100 - best - rec)
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
		designers: f.designers ?? [],
		categories: f.categories ?? [],
		mechanics: f.mechanics ?? [],
		minPlayers: f.min_players,
		maxPlayers: f.max_players,
		minTime: f.min_playtime,
		maxTime: f.max_playtime,
		minAge: f.min_age,
		geek: f.geek_rating,
		average: f.average_rating,
		ratings: f.users_rated,
		weight: f.average_weight,
		playerCounts: pcts,
		bestAt: bestAt && bestAt.best > 0 ? bestAt.count : null,
		similar: (doc.similar as unknown as SimilarRow[]).map((s) => ({
			id: s.game_id,
			name: s.name,
			year: s.year_published,
			similarity: 1 - s.distance
		})),
		hasPrediction: doc.predictions != null
	};
}

export const load: PageServerLoad = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(404, 'Not a valid game id.');

	try {
		const game = toViewModel(await warehouseClient().getGame(id));
		return { game };
	} catch (e) {
		if (e instanceof GameNotFoundError) throw error(404, `Game ${id} not found.`);
		throw e;
	}
};
