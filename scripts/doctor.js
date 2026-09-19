/**
 * Check local config beyond toolchain versions: is `.env` present with the keys needed
 * to boot, and can we actually reach BigQuery? Catches the two failure modes that
 * otherwise surface as a login redirect loop or an empty /games page.
 *
 * Advisory only — exits 0 even on warnings, so it stays usable as a quick sanity check.
 */
import { existsSync, readFileSync } from 'node:fs';

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

console.log('\nlocal config');

if (!existsSync('.env')) {
	warn('.env missing — run `just env`');
	process.exit(0);
}

const env = readFileSync('.env', 'utf8');
const value = (key) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1].trim() ?? '';

// Either the dev bypass or a real session secret is enough to get past the (app) guard.
if (value('DEV_AUTH_EMAIL')) ok(`DEV_AUTH_EMAIL set — login screen bypassed (${value('DEV_AUTH_EMAIL')})`);
else if (value('SESSION_SECRET')) ok('SESSION_SECRET set — real login/register flow active');
else warn('neither DEV_AUTH_EMAIL nor SESSION_SECRET set — every page will redirect to /login');

const project = value('GCP_PROJECT_ID') || 'bgg-data-warehouse';
ok(`GCP_PROJECT_ID=${project}`);

// The real test: mint a token from ADC and confirm every table the catalog joins is
// readable. Dry-run queries cost nothing and still exercise auth + permissions. Checked
// one table at a time so a failure names the table you actually lack access to —
// `predictions` is a separate dataset and can be granted separately from `analytics`.
const CATALOG_TABLES = [
	'analytics.games_features',
	'analytics.best_player_counts',
	'predictions.bgg_predictions'
];

// Only exercised by the real login flow and the "My collection" toggle — a gap here is a
// warning, not a blocker, when DEV_AUTH_EMAIL is set.
const ACCOUNT_TABLES = ['core.users', 'collections.user_collections'];

console.log('\ngcp credentials');
let noCreds = false;
let failed = false;
for (const table of [...CATALOG_TABLES, ...ACCOUNT_TABLES]) {
	const optional = ACCOUNT_TABLES.includes(table) ? ' (login / collections only)' : '';
	try {
		const { BigQuery } = await import('@google-cloud/bigquery');
		const bq = new BigQuery({ projectId: project });
		await bq.createQueryJob({
			query: `SELECT 1 FROM \`${project}.${table}\` LIMIT 1`,
			dryRun: true
		});
		ok(`${table} readable${optional}`);
	} catch (err) {
		const msg = String(err?.message ?? err);
		if (!optional) failed = true;
		if (/Could not load the default credentials|Unable to detect|does not exist, or it is not a file|ENOENT/i.test(msg)) {
			// Credentials are absent, not table-specific — report once and stop retrying.
			warn('no ADC found — run `gcloud auth application-default login`');
			noCreds = true;
		} else if (/Permission denied|Access Denied|403/i.test(msg)) {
			warn(`${table} — no read access${optional}`);
		} else if (/Not found|404/i.test(msg)) {
			warn(`${table} — not found`);
		} else {
			warn(`${table} — check failed: ${msg.split('\n')[0]}`);
		}
	}
	if (noCreds) break;
}
if (failed) {
	console.log('    The catalog fails to load until this resolves; the rest of the app still runs.');
}

// Game detail pages call the gated warehouse API with a token from `gcloud auth login`
// (a separate credential from ADC). Only worth checking when the URL is configured.
console.log('\nwarehouse api');
if (!value('WAREHOUSE_API_URL')) {
	warn('WAREHOUSE_API_URL unset — game detail pages will fail; Explore still works');
} else {
	try {
		const { execSync } = await import('node:child_process');
		const token = execSync('gcloud auth print-identity-token', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
		if (token) ok('gcloud identity token available');
		else warn('gcloud returned no identity token — run `gcloud auth login`');
	} catch {
		warn('`gcloud auth print-identity-token` failed — run `gcloud auth login`');
	}
}

console.log();
