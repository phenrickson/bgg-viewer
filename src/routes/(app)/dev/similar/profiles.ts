/**
 * Export saved bench experiments as a Dataform includes module.
 *
 * `buildProfilesModule` turns the bench's saved experiments into the exact shape
 * bgg-data-warehouse `definitions/game_neighbors.sqlx` consumes via
 * `includes/similarity_profiles.js` — `module.exports = { profiles: [...] }`.
 *
 * The bench and the deployed model don't share parameter names or units: the bench
 * stores the similarity / rating floors as percents (0–95) and has no notion of
 * `source_min_users_rated`, `dims` or `distance`. This module does that translation
 * and stubs the three deploy-only fields with their defaults, flagged for review.
 * `exclude shared title words` has no SQL equivalent and is dropped (noted in the
 * header when any experiment had it on).
 */
import type { Experiment, Params } from './experiments';

export interface DeployProfile {
	name: string;
	weight: number;
	complexity_band: number | null;
	max_per_family: number | null;
	min_similarity: number;
	min_rating_pct: number;
	min_users_rated: number;
	top_k: number;
	// deploy-only — not set in the bench
	source_min_users_rated: number;
	dims: number;
	distance: string;
}

/** An experiment name → a safe profile identifier (`"Board game sicko"` → `"board_game_sicko"`). */
export function profileName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return slug || 'profile';
}

export function toProfile(name: string, p: Params): DeployProfile {
	return {
		name: profileName(name),
		weight: p.weight,
		complexity_band: p.bandOn ? p.band : null,
		max_per_family: p.maxPerFamily,
		min_similarity: p.minSim / 100,
		min_rating_pct: p.minRatingPct / 100,
		min_users_rated: p.minUsers,
		top_k: p.topK,
		source_min_users_rated: 0,
		dims: 64,
		distance: 'COSINE'
	};
}

const BENCH_KEYS = [
	'name',
	'weight',
	'complexity_band',
	'max_per_family',
	'min_similarity',
	'min_rating_pct',
	'min_users_rated',
	'top_k'
] as const;
const DEPLOY_KEYS = ['source_min_users_rated', 'dims', 'distance'] as const;

function renderProfile(profile: DeployProfile): string {
	const line = (k: keyof DeployProfile) => {
		const v = profile[k];
		const val = typeof v === 'string' ? JSON.stringify(v) : v === null ? 'null' : String(v);
		return `      ${k}: ${val}`;
	};
	return [
		'    {',
		BENCH_KEYS.map(line).join(',\n') + ',',
		'      // deploy-only — review before shipping:',
		DEPLOY_KEYS.map(line).join(',\n'),
		'    }'
	].join('\n');
}

export function buildProfilesModule(experiments: Experiment[], now: Date = new Date()): string {
	const hadExcludeTitle = experiments.some(
		(e) => (e.params as Params & { excludeTitle?: boolean }).excludeTitle
	);
	const stamp = now.toISOString().slice(0, 10);
	const body = experiments.map((e) => renderProfile(toProfile(e.name, e.params))).join(',\n');
	const note = hadExcludeTitle
		? '\n// NOTE: "exclude shared title words" was on for an experiment; it has no SQL\n//       equivalent and was dropped.'
		: '';

	return `// similarity_profiles.js — generated from the bgg-viewer similarity tuning bench, ${stamp}
// Consumed by bgg-data-warehouse definitions/game_neighbors.sqlx via includes/.
// Review the fields marked "deploy-only" before deploying.${note}

module.exports = {
  profiles: [
${body}
  ]
};
`;
}
