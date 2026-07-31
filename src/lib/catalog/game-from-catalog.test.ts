import { describe, it, expect } from 'vitest';
import { gameFromCatalogRow, type CatalogGameRow } from './game-from-catalog';

const row = (over: Partial<CatalogGameRow> = {}): CatalogGameRow => ({
	game_id: 174430,
	name: 'Gloomhaven',
	year_published: 2017,
	geek_rating: 8.42,
	average_rating: 8.6,
	average_weight: 3.87,
	users_rated: 61234,
	min_players: 1,
	max_players: 4,
	...over
});

describe('gameFromCatalogRow', () => {
	it('maps the scalars the catalog carries', () => {
		const g = gameFromCatalogRow(row());
		expect(g).toMatchObject({
			id: 174430,
			name: 'Gloomhaven',
			year: 2017,
			geek: 8.42,
			average: 8.6,
			weight: 3.87,
			ratings: 61234,
			minPlayers: 1,
			maxPlayers: 4
		});
	});

	it('leaves warehouse-only fields absent rather than undefined', () => {
		const g = gameFromCatalogRow(row());
		expect(g.image).toBeNull();
		expect(g.description).toBeNull();
		expect(g.minTime).toBeNull();
		expect(g.maxTime).toBeNull();
		expect(g.minAge).toBeNull();
		expect(g.weightVotes).toBeNull();
		expect(g.lastUpdated).toBeNull();
		expect(g.similar).toEqual([]);
	});

	it('normalizes list columns, dropping blanks and nulls', () => {
		const g = gameFromCatalogRow(
			row({
				designers: ['Isaac Childres', '', null],
				categories: ['Adventure', 'Fantasy'],
				publishers: []
			})
		);
		expect(g.designers).toEqual(['Isaac Childres']);
		expect(g.categories).toEqual(['Adventure', 'Fantasy']);
		expect(g.publishers).toEqual([]);
	});

	it('reads Arrow-style iterables that are not plain arrays', () => {
		// DuckDB/Arrow can hand back typed arrays or proxy vectors, so the mapper iterates
		// rather than trusting Array.isArray.
		const g = gameFromCatalogRow(
			row({
				best_player_counts: new Int32Array([2, 3]),
				mechanics: new Set(['Hand Management'])
			})
		);
		expect(g.playerCounts.map((p) => p.count)).toEqual(['2', '3']);
		expect(g.mechanics).toEqual(['Hand Management']);
	});

	it('merges best and recommended counts into one ordered set', () => {
		const g = gameFromCatalogRow(
			row({ best_player_counts: [3], recommended_player_counts: [2, 3, 4] })
		);
		expect(g.playerCounts.map((p) => p.count)).toEqual(['2', '3', '4']);
		expect(g.playerCounts.find((p) => p.count === '3')).toMatchObject({
			best: 100,
			recommended: 100
		});
		expect(g.playerCounts.find((p) => p.count === '2')).toMatchObject({ best: 0, recommended: 100 });
		expect(g.bestAt).toBe('3');
	});

	it('reports no vote totals, so the page does not render a false zero', () => {
		const g = gameFromCatalogRow(row({ best_player_counts: [4] }));
		expect(g.playerCounts.every((p) => p.votes === 0)).toBe(true);
	});

	it('carries predictions through, without claiming model provenance it lacks', () => {
		const g = gameFromCatalogRow(
			row({
				predicted_hurdle_prob: 0.93,
				predicted_geek_rating: 7.1,
				predicted_rating: 7.6,
				predicted_complexity: 3.2,
				predicted_users_rated: 4200,
				sample_status: 'out_of_sample',
				training_cutoff_year: 2024
			})
		);
		expect(g.predictions).toMatchObject({
			hurdle: 0.93,
			geek: 7.1,
			rating: 7.6,
			complexity: 3.2,
			usersRated: 4200,
			sampleStatus: 'out_of_sample',
			trainingCutoff: 2024,
			models: []
		});
		// Timestamps live on the warehouse document, not in the artifact.
		expect(g.predictions?.scoredAt).toBeNull();
	});

	it('returns null predictions when the row carries none', () => {
		expect(gameFromCatalogRow(row()).predictions).toBeNull();
	});

	it('treats a null sample_status as unknown rather than a forecast', () => {
		const g = gameFromCatalogRow(row({ predicted_geek_rating: 7.1, sample_status: null }));
		expect(g.predictions?.sampleStatus).toBeNull();
	});

	it('coerces non-finite numerics to null instead of NaN', () => {
		const g = gameFromCatalogRow(row({ geek_rating: NaN, year_published: null }));
		expect(g.geek).toBeNull();
		expect(g.year).toBeNull();
	});
});
