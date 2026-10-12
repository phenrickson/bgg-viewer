/**
 * `/dev/genealogy`'s state, all of it in the URL, so a tree can be linked and Back
 * restores the one before (the page pushes a history entry per re-centre). Game ids, not
 * dataset indices, so a URL survives a rebuilt artifact. Junk is dropped, never thrown.
 */
import type { YMode } from './genealogy-layout';

export interface GenealogyState {
	game: number | null;
	t: number;
	y: YMode;
	/** Game ids whose own direction is unfolded. */
	unfolded: number[];
	/** `${gameId}:${dir}` — shown past the cap. */
	expanded: string[];
	/** Previous centres, oldest first. */
	trail: number[];
}

/** Starting similarity floor. A tuning value: revisit after the first look at real trees. */
export const DEFAULT_THRESHOLD = 0.8;
/** Strongest links shown per unfold before "+N more". */
export const DEFAULT_CAP = 8;
/**
 * The slider's range, enforced on hand-edited URLs too: below ~0.5 every game links to
 * most of the catalog and each rebuild scans and sorts tens of thousands per node.
 */
export const T_MIN = 0.5;
export const T_MAX = 0.99;

const KEY = /^\d+:(up|down|same)$/;
const ids = (v: string | null) =>
	(v ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);

export function fromParams(p: URLSearchParams): GenealogyState {
	const game = Number(p.get('game'));
	const t = Number(p.get('t'));
	return {
		game: Number.isInteger(game) && game > 0 ? game : null,
		t: p.has('t') && Number.isFinite(t) && t > 0 && t < 1 ? Math.min(T_MAX, Math.max(T_MIN, t)) : DEFAULT_THRESHOLD,
		y: p.get('y') === 'gen' ? 'gen' : 'year',
		unfolded: ids(p.get('u')),
		expanded: (p.get('a') ?? '').split(',').filter((k) => KEY.test(k)),
		trail: ids(p.get('trail'))
	};
}

export function toParams(s: GenealogyState): URLSearchParams {
	const p = new URLSearchParams();
	if (s.game != null) p.set('game', String(s.game));
	if (s.t !== DEFAULT_THRESHOLD) p.set('t', String(s.t));
	if (s.y !== 'year') p.set('y', s.y);
	if (s.unfolded.length) p.set('u', s.unfolded.join(','));
	if (s.expanded.length) p.set('a', s.expanded.join(','));
	if (s.trail.length) p.set('trail', s.trail.join(','));
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

/**
 * Which previous centres the breadcrumb shows: the last `keep`, unless expanded. `k` is
 * each one's position in the full trail, which is what clicking it navigates by.
 */
export function trailView(trail: number[], expanded: boolean, keep = 3): { hidden: number; shown: { id: number; k: number }[] } {
	const from = expanded ? 0 : Math.max(0, trail.length - keep);
	return { hidden: from, shown: trail.slice(from).map((id, i) => ({ id, k: from + i })) };
}
