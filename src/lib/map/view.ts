/**
 * The map's view state and its URL form. Everything a person can change with the controls
 * lives here so a view can be shared as a link and comes back the same on reload. Zoom/pan
 * is deliberately *not* here — it's a transient gesture, not a view someone means to share.
 */

/** `strip`: one component on x (`x`), games jittered on y — a dimension read on its own. */
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
	/** Draw upcoming games at all. */
	upcoming: boolean;
	/** Hide established games rated by fewer people than this. */
	minRatings: number;
	/** Category codes (1..k) to keep; null = all. Set by clicking legend swatches. */
	categories: number[] | null;
	/** Selected game ids — clicked or lassoed. Capped in the URL (see MAX_URL_SELECTED). */
	selected: number[];
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
	categories: null,
	selected: []
};

/** A lasso can select thousands; the URL carries at most this many. */
export const MAX_URL_SELECTED = 100;

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

/** Parse a view from URL params. `k` bounds the axis pickers; bad values fall back. */
export function fromParams(params: URLSearchParams, k: number): ViewState {
	const x = int(params.get('x'), DEFAULT_VIEW.x, 1, k);
	let y = int(params.get('y'), DEFAULT_VIEW.y, 1, k);
	if (y === x) y = x === 1 ? 2 : 1; // never plot a component against itself
	const sel = (params.get('g') ?? '')
		.split(',')
		.map((v) => int(v, 0, 1, Number.MAX_SAFE_INTEGER))
		.filter((v) => v > 0)
		.slice(0, MAX_URL_SELECTED);
	const cats = (params.get('cat') ?? '')
		.split(',')
		.map((c) => int(c, 0, 1, 7))
		.filter((c) => c > 0);
	return {
		projection: oneOf(params.get('p'), PROJECTIONS, DEFAULT_VIEW.projection),
		x,
		y,
		colour: oneOf(params.get('c'), COLOURS, DEFAULT_VIEW.colour),
		size: oneOf(params.get('s'), SIZES, DEFAULT_VIEW.size),
		upcoming: params.get('u') !== '0',
		minRatings: int(params.get('r'), DEFAULT_VIEW.minRatings, MIN_RATINGS_FLOOR, 1_000_000),
		categories: cats.length ? [...new Set(cats)].sort((a, b) => a - b) : null,
		selected: [...new Set(sel)]
	};
}

/** Serialize a view, omitting anything at its default so a fresh view has a clean URL. */
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
	if (!view.upcoming) p.set('u', '0');
	if (view.minRatings !== DEFAULT_VIEW.minRatings) p.set('r', String(view.minRatings));
	if (view.categories?.length) p.set('cat', view.categories.join(','));
	if (view.selected.length) p.set('g', view.selected.slice(0, MAX_URL_SELECTED).join(','));
	return p;
}
