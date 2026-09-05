import { describe, it, expect } from 'vitest';
import { buildProfilesModule, profileName, toProfile, type DeployProfile } from './profiles';
import type { Experiment, Params } from './experiments';

const params = (over: Partial<Params> = {}): Params => ({
	excludeTitle: false,
	bandOn: true,
	band: 1,
	minSim: 0,
	minRatingPct: 0,
	maxRatingPct: 100,
	minAvgRating: 0,
	maxAvgRating: 10,
	minUsers: 100,
	weight: 0.8,
	topK: 10,
	maxPerFamily: 2,
	...over
});

const exp = (name: string, over: Partial<Params> = {}): Experiment => ({
	name,
	params: params(over),
	savedAt: 0
});

/** Run the generated module text the way Dataform's `require()` would. */
function evalModule(text: string): { profiles: DeployProfile[] } {
	const module = { exports: {} as { profiles: DeployProfile[] } };
	new Function('module', 'exports', text)(module, module.exports);
	return module.exports;
}

describe('profileName', () => {
	it('slugifies an experiment name to a safe identifier', () => {
		expect(profileName('Board game sicko')).toBe('board_game_sicko');
		expect(profileName('  similar / recommended ')).toBe('similar_recommended');
		expect(profileName('default')).toBe('default');
		expect(profileName('!!!')).toBe('profile');
	});
});

describe('toProfile', () => {
	it('maps bench units to deploy units', () => {
		const p = toProfile('recommended', params({ minSim: 50, minRatingPct: 50, weight: 0.6 }));
		expect(p.min_similarity).toBe(0.5);
		expect(p.min_rating_pct).toBe(0.5);
		expect(p.weight).toBe(0.6);
	});

	it('turns a disabled band into null, keeps an enabled one', () => {
		expect(toProfile('x', params({ bandOn: false, band: 1 })).complexity_band).toBeNull();
		expect(toProfile('x', params({ bandOn: true, band: 1.5 })).complexity_band).toBe(1.5);
	});

	it('carries max_per_family through untouched (null / 0 / N)', () => {
		expect(toProfile('x', params({ maxPerFamily: null })).max_per_family).toBeNull();
		expect(toProfile('x', params({ maxPerFamily: 0 })).max_per_family).toBe(0);
		expect(toProfile('x', params({ maxPerFamily: 1 })).max_per_family).toBe(1);
	});

	it('stubs the deploy-only fields', () => {
		const p = toProfile('x', params());
		expect(p.source_min_users_rated).toBe(0);
		expect(p.dims).toBe(64);
		expect(p.distance).toBe('COSINE');
	});

	it('maps maxRatingPct to a fraction, 100 (off) becoming 1', () => {
		expect(toProfile('x', params()).max_rating_pct).toBe(1);
		expect(toProfile('x', params({ maxRatingPct: 75 })).max_rating_pct).toBe(0.75);
	});

	it('carries minAvgRating/maxAvgRating through as raw values, independent of the geek pair', () => {
		const p = toProfile('x', params({ minAvgRating: 6.5, maxAvgRating: 8.5 }));
		expect(p.min_avg_rating).toBe(6.5);
		expect(p.max_avg_rating).toBe(8.5);
		expect(p.min_rating_pct).toBe(0);
		expect(p.max_rating_pct).toBe(1);
	});
});

describe('buildProfilesModule', () => {
	const experiments = [
		exp('default', { weight: 0.8, band: 1, bandOn: true, maxPerFamily: 2 }),
		exp('recommended', {
			weight: 0.6,
			bandOn: false,
			maxPerFamily: 1,
			minSim: 50,
			minRatingPct: 50
		}),
		exp('board game sicko', { weight: 1, bandOn: false, maxPerFamily: 1, minUsers: 25 })
	];
	const text = buildProfilesModule(experiments, new Date('2026-09-03T12:00:00Z'));

	it('is a valid Dataform includes module', () => {
		const out = evalModule(text);
		expect(Array.isArray(out.profiles)).toBe(true);
		expect(out.profiles.map((p) => p.name)).toEqual(['default', 'recommended', 'board_game_sicko']);
	});

	it('carries the translated values into the module', () => {
		const rec = evalModule(text).profiles[1];
		expect(rec).toMatchObject({
			name: 'recommended',
			weight: 0.6,
			complexity_band: null,
			max_per_family: 1,
			min_similarity: 0.5,
			min_rating_pct: 0.5,
			max_rating_pct: 1,
			min_users_rated: 100,
			source_min_users_rated: 0,
			dims: 64,
			distance: 'COSINE'
		});
	});

	it('stamps the date and omits the title-words note when unused', () => {
		expect(text).toContain('tuning bench, 2026-09-03');
		expect(text).not.toContain('exclude shared title words');
	});

	it('flags a dropped "exclude shared title words" setting', () => {
		const withTitle = buildProfilesModule([exp('x', { excludeTitle: true })]);
		expect(withTitle).toContain('exclude shared title words');
		expect(evalModule(withTitle).profiles).toHaveLength(1);
	});

	it('flags a max_rating_pct ceiling as needing sqlx support', () => {
		const withCeiling = buildProfilesModule([exp('x', { maxRatingPct: 80 })]);
		expect(withCeiling).toContain('max_rating_pct" (a ceiling)');
		expect(evalModule(withCeiling).profiles[0].max_rating_pct).toBe(0.8);
		expect(buildProfilesModule([exp('x')])).not.toContain('max_rating_pct" (a ceiling)');
	});

	it('flags an average-rating filter as needing sqlx support', () => {
		const withAvg = buildProfilesModule([exp('x', { minAvgRating: 6.5 })]);
		expect(withAvg).toContain('min_avg_rating" / "max_avg_rating" was set');
		expect(evalModule(withAvg).profiles[0].min_avg_rating).toBe(6.5);
		expect(buildProfilesModule([exp('x')])).not.toContain('min_avg_rating" / "max_avg_rating" was set');
	});
});
