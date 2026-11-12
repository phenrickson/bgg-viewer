/**
 * Build the BGG.CON library snapshot (the "universe": games and copy counts) and save it to
 * `bggcon/library.json` in the artifacts bucket. Run daily by `.github/workflows/bggcon-library.yml`,
 * or by hand from that workflow when new games are added.
 *
 * About 86 requests to Tabletop.Events, one at a time (~2 minutes). Reuses the app's own
 * `tte.ts` and `snapshot.ts`, so the job and the app can't disagree on the shape. An empty
 * pull fails the run and leaves the last snapshot in place.
 *
 * TEMPORARY: remove with the rest of the BGG.CON feature after the con.
 *
 * Usage: tsx scripts/build-bggcon-library.ts [--dry-run]
 */
import { Storage } from '@google-cloud/storage';
import { fetchLibrary } from '../src/lib/server/bggcon/tte';
import { buildSnapshot, assertUsable, SNAPSHOT_NAME } from '../src/lib/server/bggcon/snapshot';

const PROJECT = process.env.GCP_PROJECT_ID || 'bgg-data-warehouse';
const BUCKET = process.env.CATALOG_BUCKET || `${PROJECT}-bgg-viewer-artifacts`;

async function main(): Promise<void> {
	const t0 = Date.now();
	console.log('Pulling the library from Tabletop.Events…');
	const rows = await fetchLibrary();
	const snap = buildSnapshot(rows);
	assertUsable(snap);
	console.log(
		`  ${rows.length.toLocaleString()} copies → ${snap.games.length.toLocaleString()} games in ${Date.now() - t0}ms; dropped`,
		snap.dropped
	);

	if (process.argv.includes('--dry-run')) {
		console.log(`  dry run: would write gs://${BUCKET}/${SNAPSHOT_NAME}; nothing written`);
		return;
	}
	await new Storage({ projectId: PROJECT })
		.bucket(BUCKET)
		.file(SNAPSHOT_NAME)
		.save(JSON.stringify(snap), {
			resumable: false,
			metadata: { contentType: 'application/json', cacheControl: 'no-store' }
		});
	console.log(`  wrote gs://${BUCKET}/${SNAPSHOT_NAME}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
