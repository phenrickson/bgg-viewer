/**
 * The vectors, years and families a genealogy is built from, aligned to the coordinates
 * artifact's order so a tree index is a map index and `PointCanvas` can draw it. Vectors come
 * from the shipped vectors artifact (`fetchVectors()`, memoised, shared with Recommend and
 * the network tool); families from the catalog already in the browser.
 *
 * Families are restricted to `Game: …` and `Series: …` — BGG's "a version / edition / entry
 * of that line" groupings, the same rule the similar-explorer build uses. The other prefixes
 * (`Theme:`, `Components:` …) are cross-cutting tags that would call half the catalog family.
 * Names are interned to ints in SQL so the result comes back as typed columns.
 *
 * Reimplementation / expansion links aren't in any shipped artifact, so the tree doesn't
 * mark them for now.
 */
import { fetchVectors, type VectorSet } from '$lib/recommend/vectors';
import { queryColumns } from '$lib/catalog/catalog.svelte';
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { GenealogyInput } from './genealogy';
import { alignVectors } from './network-data';

/** One row per (game, `Game:`/`Series:` family), the family as a dense int id. */
export const FAMILY_SQL = `
	SELECT CAST(game_id AS INTEGER) AS game_id, CAST(DENSE_RANK() OVER (ORDER BY fam) AS INTEGER) AS family_id
	FROM (
		SELECT game_id, UNNEST(families) AS fam FROM catalog
	)
	WHERE fam LIKE 'Game: %' OR fam LIKE 'Series: %'`;

export interface FamilyColumns {
	game_id: ArrayLike<number>;
	family_id: ArrayLike<number>;
}

export function buildGenealogyInput(
	vs: VectorSet,
	fams: FamilyColumns,
	coords: CoordinateSet,
	facts: GameFacts
): GenealogyInput {
	const { emb, dim, have } = alignVectors(vs, coords, 'genealogy');
	const n = coords.ids.length;
	const families: number[][] = Array.from({ length: n }, () => []);
	for (let r = 0; r < fams.game_id.length; r++) {
		const i = coords.index.get(Number(fams.game_id[r]));
		if (i != null) families[i].push(Number(fams.family_id[r]));
	}
	return { n, dim, emb, ids: coords.ids, year: facts.year, families, has: (i) => have[i] === 1 };
}

export async function loadGenealogyData(coords: CoordinateSet, facts: GameFacts): Promise<GenealogyInput> {
	const [vs, fams] = await Promise.all([fetchVectors(), queryColumns(FAMILY_SQL, ['game_id', 'family_id'])]);
	return buildGenealogyInput(vs, { game_id: fams.game_id, family_id: fams.family_id }, coords, facts);
}
