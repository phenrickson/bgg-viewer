/**
 * The vectors the ego network is built from: the dev similarity dataset's full 64-d
 * embeddings (`/dev/similar/dataset`), L2-normalised and aligned to the coordinates
 * artifact's order so a graph index is a map index. Dev-only by construction — that
 * dataset is ~9 MB and never ships.
 */
import { tableFromIPC } from 'apache-arrow';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { NetworkData } from './network';

export async function loadNetworkData(
	coords: CoordinateSet,
	facts: GameFacts,
	minRatings: () => number
): Promise<NetworkData> {
	const res = await fetch('/dev/similar/dataset');
	if (!res.ok) throw new Error(`embedding dataset fetch failed (${res.status})`);
	const t = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
	const ids = t.getChild('game_id')!.toArray() as Int32Array;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const col = t.getChild('embedding') as any;
	const n = coords.ids.length;
	const dim: number = col.get(0)?.length ?? 64;
	const emb = new Float32Array(n * dim);
	const have = new Uint8Array(n);
	for (let o = 0; o < t.numRows; o++) {
		const i = coords.index.get(ids[o]);
		if (i == null) continue;
		// A list cell is an Arrow Vector — `.get(d)` works, `[d]` doesn't.
		const v = (col.get(o)?.toArray() ?? null) as ArrayLike<number> | null;
		if (!v) continue;
		let norm = 0;
		for (let d = 0; d < dim; d++) norm += v[d] * v[d];
		norm = Math.sqrt(norm) || 1;
		for (let d = 0; d < dim; d++) emb[i * dim + d] = v[d] / norm;
		have[i] = 1;
	}
	return {
		n, dim, emb,
		eligible: (i) => have[i] === 1 && facts.upcoming[i] === 0 && facts.usersRated[i] >= minRatings()
	};
}
