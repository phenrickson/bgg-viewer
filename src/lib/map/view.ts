/**
 * How the map DRAWS — and nothing about which games it draws.
 *
 * `ViewState` used to carry three filters of its own (`minRatings`, `upcoming`,
 * `categories`) plus a selection, which meant the site had two filter languages for the same
 * 36k games and no way to carry a set from Explore to the map. All four moved to `Scope`,
 * which already expressed every one of them:
 *
 *   minRatings  -> usersRatedMin      (a window, rather than a floor)
 *   upcoming    -> universe
 *   categories  -> categories          (the real BGG tags, not palette codes)
 *   selected    -> lasso               (an explicit id set)
 *
 * What is left is exactly the encodings: where points go, what colour they are, how big.
 * Those are orthogonal to which games are in view, and the separation is what lets one
 * `Scope` drive a list and a plot at once.
 *
 * Zoom/pan is deliberately still absent — a transient gesture, not a view someone means to
 * share.
 */

/** `strip`: one component on x, games jittered on y — a dimension read on its own. */
export type Projection = 'pca' | 'umap' | 'strip';
export type ColourBy = 'weight' | 'geek' | 'rating' | 'year' | 'upcoming' | 'category';
export type SizeBy = 'popularity' | 'uniform';

export interface ViewState {
	projection: Projection;
	/** 1-based component for the X / Y axis (PCA only). */
	x: number;
	y: number;
	colour: ColourBy;
	/** Dot radius: log(users_rated), or one size for every game. */
	size: SizeBy;
}

export const DEFAULT_VIEW: ViewState = {
	projection: 'pca',
	x: 1,
	y: 2,
	colour: 'weight',
	size: 'popularity'
};

const PROJECTIONS: Projection[] = ['pca', 'umap', 'strip'];
const COLOURS: ColourBy[] = ['weight', 'geek', 'rating', 'year', 'upcoming', 'category'];
const SIZES: SizeBy[] = ['popularity', 'uniform'];

function oneOf<T extends string>(v: string | null, allowed: T[], fallback: T): T {
	return v !== null && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

function int(v: string | null, fallback: number, lo: number, hi: number): number {
	const n = v === null ? NaN : Number(v);
	return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
}

/** Parse the encodings from URL params. `k` bounds the axis pickers; bad values fall back. */
export function fromParams(params: URLSearchParams, k: number): ViewState {
	const x = int(params.get('x'), DEFAULT_VIEW.x, 1, k);
	let y = int(params.get('y'), DEFAULT_VIEW.y, 1, k);
	if (y === x) y = x === 1 ? 2 : 1; // never plot a component against itself
	return {
		projection: oneOf(params.get('p'), PROJECTIONS, DEFAULT_VIEW.projection),
		x,
		y,
		colour: oneOf(params.get('c'), COLOURS, DEFAULT_VIEW.colour),
		size: oneOf(params.get('s'), SIZES, DEFAULT_VIEW.size)
	};
}

/** Serialize, omitting anything at its default so a fresh view has a clean URL. */
export function toParams(view: ViewState): URLSearchParams {
	const p = new URLSearchParams();
	if (view.projection !== DEFAULT_VIEW.projection) p.set('p', view.projection);
	if (view.projection === 'pca' || view.projection === 'strip') {
		if (view.x !== DEFAULT_VIEW.x) p.set('x', String(view.x));
	}
	if (view.projection === 'pca') {
		if (view.y !== DEFAULT_VIEW.y) p.set('y', String(view.y));
	}
	if (view.colour !== DEFAULT_VIEW.colour) p.set('c', view.colour);
	if (view.size !== DEFAULT_VIEW.size) p.set('s', view.size);
	return p;
}
