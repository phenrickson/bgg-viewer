/**
 * `/genealogy`'s state — both views, Genealogy and Network — all of it in the URL, so a tree can be linked and Back
 * restores the one before (the page pushes a history entry per re-centre, which starts a
 * fresh tree). Game ids, not
 * dataset indices, so a URL survives a rebuilt artifact. Junk is dropped, never thrown.
 */
import type { YMode } from './genealogy-layout';
import { SCAN_FLOOR, type Dir, type Genealogy } from './genealogy';

export type View = 'tree' | 'net';
export type Hops = 1 | 2 | 3;

export interface GenealogyState {
	game: number | null;
	/** Genealogy (the tree) or Network (the ego network). The centre is shared. */
	view: View;
	/** Network: neighbours per game. */
	k: number;
	/** Network: rings out from the centre. */
	hops: Hops;
	/** Network: dash the one-way links. Off by default: every link drawn alike, by similarity. */
	oneway: boolean;
	/** Network: game ids expanded by hand, each adding its own neighbours past it. */
	open: number[];
	t: number;
	y: YMode;
	/** Show same-year games beside the centre. Off by default. */
	same: boolean;
	/** Game ids whose own direction is unfolded. */
	unfolded: number[];
	/** `${gameId}:${dir}` — shown past the cap. */
	expanded: string[];
}

/** Starting similarity floor. A tuning value; 0.7 after Phil's look at real trees (2026-11-11). */
export const DEFAULT_THRESHOLD = 0.7;
/** Strongest links shown per unfold before "+N more". */
export const DEFAULT_CAP = 8;
/**
 * The slider's range, enforced on hand-edited URLs too: below ~0.5 every game links to
 * most of the catalog and each rebuild scans and sorts tens of thousands per node.
 */
export const T_MIN = SCAN_FLOOR;
export const T_MAX = 0.99;
/** Network defaults and the k slider's range (the bench's). */
export const DEFAULT_K = 10;
export const K_MIN = 4;
export const K_MAX = 25;
export const DEFAULT_HOPS: Hops = 2;

const KEY = /^\d+:(up|down|same)$/;
const ids = (v: string | null) =>
	(v ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);

export function fromParams(p: URLSearchParams): GenealogyState {
	const game = Number(p.get('game'));
	const t = Number(p.get('t'));
	const k = Number(p.get('k'));
	const hops = Number(p.get('hops'));
	return {
		game: Number.isInteger(game) && game > 0 ? game : null,
		view: p.get('v') === 'net' ? 'net' : 'tree',
		k: Number.isInteger(k) && k >= K_MIN && k <= K_MAX ? k : DEFAULT_K,
		hops: hops === 1 || hops === 2 || hops === 3 ? hops : DEFAULT_HOPS,
		oneway: p.get('ow') === '1',
		open: ids(p.get('o')),
		t: p.has('t') && Number.isFinite(t) && t > 0 && t < 1 ? Math.min(T_MAX, Math.max(T_MIN, t)) : DEFAULT_THRESHOLD,
		y: p.get('y') === 'gen' ? 'gen' : 'year',
		same: p.get('same') === '1',
		unfolded: ids(p.get('u')),
		expanded: (p.get('a') ?? '').split(',').filter((k) => KEY.test(k))
	};
}

export function toParams(s: GenealogyState): URLSearchParams {
	const p = new URLSearchParams();
	if (s.game != null) p.set('game', String(s.game));
	if (s.view !== 'tree') p.set('v', s.view);
	if (s.k !== DEFAULT_K) p.set('k', String(s.k));
	if (s.hops !== DEFAULT_HOPS) p.set('hops', String(s.hops));
	if (s.oneway) p.set('ow', '1');
	if (s.open.length) p.set('o', s.open.join(','));
	if (s.t !== DEFAULT_THRESHOLD) p.set('t', String(s.t));
	if (s.y !== 'year') p.set('y', s.y);
	if (s.same) p.set('same', '1');
	if (s.unfolded.length) p.set('u', s.unfolded.join(','));
	if (s.expanded.length) p.set('a', s.expanded.join(','));
	return p;
}

/**
 * The state to render. SvelteKit's shallow `pushState`/`replaceState` set `page.state` and
 * leave `page.url` at what was loaded (Back restores `page.state` from the history entry),
 * so a committed state lives in `page.state.genealogy`; the URL is only read on a fresh
 * load or a pasted link.
 */
export function currentState(pageState: { genealogy?: GenealogyState }, url: URL): GenealogyState {
	return pageState.genealogy ?? fromParams(url.searchParams);
}

/** A fresh tree: on `game` (default the current one), nothing unfolded or expanded, settings (and view) kept. */
export function startAt(s: GenealogyState, game: number | null = s.game): GenealogyState {
	return { ...s, game, unfolded: [], expanded: [], open: [] };
}

/**
 * Fold an expanded network game: forget it and every expansion that hung off it, so
 * expanding again starts from just its own neighbours. `nodes` is the current network.
 */
export function foldNet(s: GenealogyState, nodes: { i: number; from?: number }[], ids: Int32Array, i: number): GenealogyState {
	const fromOf = new Map(nodes.map((n) => [n.i, n.from]));
	const under = (j: number) => {
		for (let p: number | undefined = j, guard = 0; p !== undefined && guard < 64; p = fromOf.get(p), guard++) if (p === i) return true;
		return false;
	};
	const gone = new Set(nodes.filter((n) => under(n.i)).map((n) => ids[n.i]));
	gone.add(ids[i]);
	return { ...s, open: s.open.filter((id) => !gone.has(id)) };
}

/**
 * Fold game `i` (a tree index): forget its unfold and every unfold and expansion beneath
 * it, so unfolding again starts at one generation rather than springing back to a subtree.
 */
export function fold(s: GenealogyState, tree: Genealogy, ids: Int32Array, i: number): GenealogyState {
	const under = new Set<number>([i]);
	// `nodes` is breadth-first, so a parent is always met before its children.
	for (const nd of tree.nodes) if (under.has(nd.via) && nd.side !== 'same') under.add(nd.i);
	const gone = new Set([...under].map((j) => ids[j]));
	return {
		...s,
		unfolded: s.unfolded.filter((id) => !gone.has(id)),
		expanded: s.expanded.filter((k) => !gone.has(Number(k.split(':')[0])))
	};
}

/** Undo a "+N more": back to the strongest `cap` for that game and direction. */
export function showFewer(s: GenealogyState, gameId: number, dir: Dir): GenealogyState {
	return { ...s, expanded: s.expanded.filter((k) => k !== `${gameId}:${dir}`) };
}
