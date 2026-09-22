/**
 * Client reader for `/api/neighbours` — the tour's precomputed nearest games, by the
 * engine's own cosine on the full embedding. See `server/neighbours/columns.ts`.
 */

export interface Neighbour {
	id: number;
	/** Cosine similarity to the source, 0–1. */
	sim: number;
}

/** What `/api/neighbours` serves; built by `server/neighbours/build.ts`. */
export interface NeighboursArtifact {
	model: string;
	version: number;
	n: number;
	/** `source id → nearest, best first` over the whole working set. */
	all: Record<string, Neighbour[]>;
	/** `source id → nearest upcoming games, best first`. */
	upcoming: Record<string, Neighbour[]>;
}

export async function fetchNeighbours(): Promise<NeighboursArtifact> {
	const res = await fetch('/api/neighbours');
	if (!res.ok) throw new Error(`neighbours fetch failed (${res.status})`);
	return (await res.json()) as NeighboursArtifact;
}

/** The `n` nearest to `id` (optionally among upcoming games only); empty if not a tour source. */
export function neighbourList(art: NeighboursArtifact, id: number, n: number, upcomingOnly = false): Neighbour[] {
	return ((upcomingOnly ? art.upcoming : art.all)[String(id)] ?? []).slice(0, n);
}

export function neighboursOf(art: NeighboursArtifact, id: number, n: number, upcomingOnly = false): number[] {
	return neighbourList(art, id, n, upcomingOnly).map((x) => x.id);
}
