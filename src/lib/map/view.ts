/**
 * The map's view state and its URL form. Everything a person can change with the controls
 * lives here so a view can be shared as a link and comes back the same on reload. Zoom/pan
 * is deliberately *not* here — it's a transient gesture, not a view someone means to share.
 */

export type Projection = 'pca' | 'umap';
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
	/** Draw upcoming games at all. */
	upcoming: boolean;
	/** Hide established games rated by fewer people than this. */
	minRatings: number;
	selected: number | null;
}

/** The working set's own floor; the slider can only raise it. */
export const MIN_RATINGS_FLOOR = 30;

export const DEFAULT_VIEW: ViewState = {
	projection: 'pca',
	x: 1,
	y: 2,
	colour: 'weight',
	size: 'popularity',
	upcoming: true,
	minRatings: MIN_RATINGS_FLOOR,
	selected: null
};

const PROJECTIONS: Projection[] = ['pca', 'umap'];
const COLOURS: ColourBy[] = ['weight', 'geek', 'rating', 'year', 'upcoming', 'category'];
const SIZES: SizeBy[] = ['popularity', 'uniform'];

function oneOf<T extends string>(v: string | null, allowed: T[], fallback: T): T {
	return v !== null && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

function int(v: string | null, fallback: number, lo: number, hi: number): number {
	const n = v === null ? NaN : Number(v);
	return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
}

/** Parse a view from URL params. `k` bounds the axis pickers; bad values fall back. */
export function fromParams(params: URLSearchParams, k: number): ViewState {
	const x = int(params.get('x'), DEFAULT_VIEW.x, 1, k);
	let y = int(params.get('y'), DEFAULT_VIEW.y, 1, k);
	if (y === x) y = x === 1 ? 2 : 1; // never plot a component against itself
	const sel = int(params.get('g'), 0, 1, Number.MAX_SAFE_INTEGER);
	return {
		projection: oneOf(params.get('p'), PROJECTIONS, DEFAULT_VIEW.projection),
		x,
		y,
		colour: oneOf(params.get('c'), COLOURS, DEFAULT_VIEW.colour),
		size: oneOf(params.get('s'), SIZES, DEFAULT_VIEW.size),
		upcoming: params.get('u') !== '0',
		minRatings: int(params.get('r'), DEFAULT_VIEW.minRatings, MIN_RATINGS_FLOOR, 1_000_000),
		selected: sel || null
	};
}

/** Serialize a view, omitting anything at its default so a fresh view has a clean URL. */
export function toParams(view: ViewState): URLSearchParams {
	const p = new URLSearchParams();
	if (view.projection !== DEFAULT_VIEW.projection) p.set('p', view.projection);
	if (view.projection === 'pca') {
		if (view.x !== DEFAULT_VIEW.x) p.set('x', String(view.x));
		if (view.y !== DEFAULT_VIEW.y) p.set('y', String(view.y));
	}
	if (view.colour !== DEFAULT_VIEW.colour) p.set('c', view.colour);
	if (view.size !== DEFAULT_VIEW.size) p.set('s', view.size);
	if (!view.upcoming) p.set('u', '0');
	if (view.minRatings !== DEFAULT_VIEW.minRatings) p.set('r', String(view.minRatings));
	if (view.selected) p.set('g', String(view.selected));
	return p;
}
