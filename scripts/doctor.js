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

// The real test: mint a token from ADC and confirm the catalog table is readable. A
// dry-run query costs nothing and still exercises auth + permissions.
console.log('\ngcp credentials');
try {
	const { BigQuery } = await import('@google-cloud/bigquery');
	const bq = new BigQuery({ projectId: project });
	await bq.createQueryJob({
		query: `SELECT 1 FROM \`${project}.analytics.games_features\` LIMIT 1`,
		dryRun: true
	});
	ok(`ADC works and ${project}.analytics.games_features is readable`);
} catch (err) {
	const msg = String(err?.message ?? err);
	if (/Could not load the default credentials|Unable to detect|does not exist, or it is not a file|ENOENT/i.test(msg)) {
		warn('no ADC found — run `gcloud auth application-default login`');
	} else if (/Permission denied|Access Denied|403/i.test(msg)) {
		warn(`ADC found, but no read access to ${project}.analytics.games_features`);
	} else if (/Not found|404/i.test(msg)) {
		warn(`ADC works, but ${project}.analytics.games_features was not found`);
	} else {
		warn(`BigQuery check failed: ${msg.split('\n')[0]}`);
	}
	console.log('    /games stays empty until this resolves; the rest of the app still runs.');
}

console.log();
