/**
 * The vectors, years and family / reimplementation ids a genealogy is built from: the dev
 * similarity dataset (`/dev/similar/dataset`) aligned to the coordinates artifact's order,
 * so a tree index is a map index and `PointCanvas` can draw it. Dev-only by construction —
 * that dataset is ~9 MB and never ships.
 *
 * The two artifacts are built separately, so they can come from different embedding runs.
 * `alignVectors` then quietly drops every game the older one lacks. That's no reason to
 * block a local session, so this loads anyway and warns, naming which one to rebuild.
 */
import { tableFromIPC } from 'apache-arrow';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { GenealogyInput } from './genealogy';
import { alignVectors } from './network-data';

/** Same key as `server/similar-explorer/serialize.ts` `META_VERSION` (server code can't be imported here). */
const META_VERSION = 'embedding_version';

export function parseGenealogyDataset(buf: Uint8Array, coords: CoordinateSet, facts: GameFacts): GenealogyInput {
	const t = tableFromIPC(buf);
	const v = t.schema.metadata.get(META_VERSION);
	if (!v) {
		console.warn('[genealogy] the similarity dataset predates version stamping — `just similar-rebuild` to check it against the coordinates.');
	} else if (Number(v) !== coords.version) {
		console.warn(
			`[genealogy] the similarity dataset is embedding v${v} but the coordinates are v${coords.version}; games only in the newer one are missing. Rebuild the older one (\`just similar-rebuild\` for the dataset).`
		);
	}
	const { emb, dim, have } = alignVectors(t, coords);
	const n = coords.ids.length;
	const families: number[][] = Array.from({ length: n }, () => []);
	const related: number[][] = Array.from({ length: n }, () => []);
	const ids = t.getChild('game_id')!.toArray() as Int32Array;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const fam = t.getChild('family_ids') as any, rel = t.getChild('related_ids') as any;
	for (let o = 0; o < t.numRows; o++) {
		const i = coords.index.get(ids[o]);
		if (i == null) continue;
		families[i] = Array.from((fam.get(o)?.toArray() ?? []) as ArrayLike<number>);
		related[i] = Array.from((rel.get(o)?.toArray() ?? []) as ArrayLike<number>);
	}
	return { n, dim, emb, ids: coords.ids, year: facts.year, families, related, has: (i) => have[i] === 1 };
}

export async function loadGenealogyData(coords: CoordinateSet, facts: GameFacts): Promise<GenealogyInput> {
	const res = await fetch('/dev/similar/dataset');
	if (!res.ok) throw new Error(`similarity dataset fetch failed (${res.status})`);
	return parseGenealogyDataset(new Uint8Array(await res.arrayBuffer()), coords, facts);
}
