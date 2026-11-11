/**
 * The vectors the ego network is built from: the shipped vectors artifact (`fetchVectors()`,
 * the same memoised load Recommend ranks with), aligned to the coordinates artifact's order
 * so a graph index is a map index.
 */
import { fetchVectors, type VectorSet } from '$lib/recommend/vectors';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { NetworkData } from './network';

/**
 * The vectors (already L2-normalised) placed at their coordinates-artifact row. `have[i]`
 * marks rows that got a vector; games the vectors have but the coordinates don't are skipped.
 * Shared with the genealogy loader.
 *
 * The two artifacts are built separately, so they can come from different embedding runs;
 * the older one then quietly lacks some games. That's no reason to block the page, so this
 * aligns anyway and warns.
 */
/**
 * The vectors placed in coordinates order, keeping only games on the active embedding version:
 * the deployed one, or the newest in the artifact when the build couldn't read it. The artifact
 * keeps every version for Recommend, but a dot product across two runs means nothing, so a
 * straggler left on an old run is treated as having no vector here.
 */
export function alignVectors(vs: VectorSet, coords: CoordinateSet, label: string): { emb: Float32Array; dim: number; have: Uint8Array } {
	const active = Number.isFinite(vs.deployed) ? vs.deployed : vs.version;
	if (!Number.isFinite(active)) {
		console.warn(`[${label}] the vectors artifact has no embedding version — can't check it against the coordinates.`);
	} else if (active !== coords.version) {
		console.warn(
			`[${label}] the active embedding is v${active} but the coordinates are v${coords.version}; games only in one of them are missing.`
		);
	}
	const rv = vs.rowVersion ?? null;
	const dim = vs.ids.length ? vs.vec.length / vs.ids.length : 64;
	const n = coords.ids.length;
	const emb = new Float32Array(n * dim);
	const have = new Uint8Array(n);
	let stale = 0;
	for (let o = 0; o < vs.ids.length; o++) {
		const i = coords.index.get(vs.ids[o]);
		if (i == null) continue;
		if (rv && Number.isFinite(active) && rv[o] !== active) { stale++; continue; }
		emb.set(vs.vec.subarray(o * dim, (o + 1) * dim), i * dim);
		have[i] = 1;
	}
	if (stale) console.warn(`[${label}] ${stale} games are on an older embedding than v${active}; left out until they're re-embedded.`);
	return { emb, dim, have };
}

export async function loadNetworkData(
	coords: CoordinateSet,
	facts: GameFacts,
	minRatings: () => number
): Promise<NetworkData> {
	const { emb, dim, have } = alignVectors(await fetchVectors(), coords, 'network');
	return {
		n: coords.ids.length, dim, emb,
		eligible: (i) => have[i] === 1 && facts.upcoming[i] === 0 && facts.usersRated[i] >= minRatings()
	};
}
