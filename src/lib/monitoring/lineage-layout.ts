/**
 * Fixed left-to-right layout for the Dataform lineage: a node sits one column right
 * of its deepest input (longest path from a source). Within a column, nodes are
 * ordered by dataset, then name. Pure, so it is unit-tested.
 */

export const DATASET_ORDER = ['raw', 'core', 'staging', 'analytics', 'predictions', 'monitoring', 'collections'];

export interface LayoutInput {
	id: string;
	dataset: string;
	name: string;
}

export interface Placement {
	column: number;
	row: number;
}

export interface Layout {
	placements: Map<string, Placement>;
	columns: number;
	rows: number;
	upstream: Map<string, string[]>;
	downstream: Map<string, string[]>;
}

const rank = (dataset: string) => {
	const i = DATASET_ORDER.indexOf(dataset);
	return i === -1 ? DATASET_ORDER.length : i;
};

export function layoutLineage(nodes: LayoutInput[], edges: [string, string][]): Layout {
	const upstream = new Map(nodes.map((n) => [n.id, [] as string[]]));
	const downstream = new Map(nodes.map((n) => [n.id, [] as string[]]));
	for (const [up, down] of edges) {
		if (!upstream.has(up) || !upstream.has(down)) continue; // an edge to an unknown node
		upstream.get(down)!.push(up);
		downstream.get(up)!.push(down);
	}

	// Kahn's algorithm, keeping the longest path. Nodes never resolved sit in a cycle.
	const depth = new Map<string, number>();
	const waiting = new Map(nodes.map((n) => [n.id, upstream.get(n.id)!.length]));
	const queue = nodes.filter((n) => waiting.get(n.id) === 0).map((n) => n.id);
	for (const id of queue) depth.set(id, 0);
	const resolved = new Set<string>();
	while (queue.length) {
		const id = queue.shift()!;
		resolved.add(id);
		for (const down of downstream.get(id)!) {
			depth.set(down, Math.max(depth.get(down) ?? 0, depth.get(id)! + 1));
			waiting.set(down, waiting.get(down)! - 1);
			if (waiting.get(down) === 0) queue.push(down);
		}
	}
	const deepest = Math.max(-1, ...[...resolved].map((id) => depth.get(id)!));
	const columnOf = (id: string) => (resolved.has(id) ? depth.get(id)! : deepest + 1);

	const byColumn = new Map<number, LayoutInput[]>();
	for (const node of nodes) {
		const column = columnOf(node.id);
		byColumn.set(column, [...(byColumn.get(column) ?? []), node]);
	}
	const placements = new Map<string, Placement>();
	let rows = 0;
	for (const [column, members] of byColumn) {
		members.sort(
			(a, b) => rank(a.dataset) - rank(b.dataset) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
		);
		members.forEach((node, row) => placements.set(node.id, { column, row }));
		rows = Math.max(rows, members.length);
	}
	return { placements, columns: byColumn.size ? Math.max(...byColumn.keys()) + 1 : 0, rows, upstream, downstream };
}
