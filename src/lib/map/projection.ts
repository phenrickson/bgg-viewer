/**
 * **Where a point goes** — the one thing that used to be welded to the embedding artifact.
 *
 * `MapLayer` reached into `coords.pcs[view.x - 1]` and `coords.umap` to work out positions,
 * which meant the layer *knew about embeddings* and could only ever draw one kind of plot.
 * Position is now an input: a producer in this module turns some source of numbers into a
 * `Projection`, and the layer draws whatever it is handed.
 *
 * The seam was already there, unacknowledged. `strip` is not an embedding at all — it is one
 * variable on x with deterministic jitter on y, i.e. an ordinary one-dimensional scatter,
 * which had to be smuggled in as a third "projection" because the type had no room for it to
 * be what it is. Once positions are an input, `weight × rating` or `year × geek rating` are
 * each a producer function over columns the browser's catalog already holds, rather than a
 * rewrite of the layer.
 *
 * Producers return DATA-SPACE values and name their axes. Normalisation to the NDC square
 * the renderer wants is `toNdc` below, applied once, the same way for every producer — so a
 * new projection cannot accidentally invent its own scaling rules.
 */
import type { CoordinateSet } from './coordinates';
import type { GameFacts } from './facts';
import type { ViewState } from './view';

export interface Projection {
	/** Per-point values in data space, aligned to `CoordinateSet.ids`. Non-finite = undrawable. */
	x: Float32Array;
	y: Float32Array;
	/** What the axes mean, for the caller to show. `null` when an axis carries nothing. */
	xLabel: string | null;
	yLabel: string | null;
	/**
	 * Keep one shared scale across both axes so distances are not distorted. True for a map
	 * of a space (embedding, UMAP); false for a plot of two unrelated quantities, where each
	 * axis should fill its own range.
	 */
	isometric: boolean;
	/**
	 * A band rather than a square: y carries nothing and the renderer should stretch x to the
	 * canvas width. The strip.
	 */
	band: boolean;
}

/**
 * Deterministic per-game jitter in roughly [-1.6, 1.6], normal-ish (sum of four uniforms).
 * Used where y carries no information but points still need to spread so density can be
 * read. Hashed from the id rather than random so a game sits in the same place every visit.
 */
export function jitter(id: number): number {
	let h = (id * 2654435761) >>> 0;
	let s = 0;
	for (let k = 0; k < 4; k++) {
		h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
		s += (h & 0xffff) / 0xffff;
	}
	return (s / 4 - 0.5) * 3.2;
}

/** A PCA component pair from the embedding artifact — the map's default view. */
export function pcaProjection(coords: CoordinateSet, x: number, y: number): Projection {
	return {
		x: coords.pcs[x - 1] ?? new Float32Array(coords.ids.length),
		y: coords.pcs[y - 1] ?? new Float32Array(coords.ids.length),
		xLabel: `Component ${x}`,
		yLabel: `Component ${y}`,
		isometric: true,
		band: false
	};
}

/** The 2-D UMAP embedding — neighbourhood structure rather than variance. */
export function umapProjection(coords: CoordinateSet): Projection {
	return {
		x: coords.umap[0],
		y: coords.umap[1],
		xLabel: 'UMAP 1',
		yLabel: 'UMAP 2',
		isometric: true,
		band: false
	};
}

/** One component read on its own: games spread along x, jittered on y so density shows. */
export function stripProjection(coords: CoordinateSet, x: number): Projection {
	const n = coords.ids.length;
	const ys = new Float32Array(n);
	for (let i = 0; i < n; i++) ys[i] = jitter(coords.ids[i]);
	return {
		x: coords.pcs[x - 1] ?? new Float32Array(n),
		y: ys,
		xLabel: `Component ${x}`,
		yLabel: null,
		isometric: false,
		band: true
	};
}

/**
 * The producer for a `ViewState`. The one place that maps the view's `projection` choice to
 * a producer, so a page never needs to know which arguments each one takes.
 */
export function projectionFor(
	coords: CoordinateSet,
	view: ViewState,
	/** Required only by the `facts` projection, which plots catalog columns rather than the
	    embedding. Absent, a `facts` view falls back to PCA rather than failing — a caller
	    without facts has nothing to plot, and an empty map says less than the default one. */
	facts?: GameFacts
): Projection {
	if (view.projection === 'umap') return umapProjection(coords);
	if (view.projection === 'strip') return stripProjection(coords, view.x);
	if (view.projection === 'facts' && facts) return factProjection(facts, view.xFact, view.yFact);
	return pcaProjection(coords, view.x, view.y);
}

/**
 * Data space → the renderer's [-1, 1] square.
 *
 * `include` decides which points the extent is measured over. The strip needs this: upcoming
 * games can sit far outside the rated data's shape, and measuring over them squashes
 * everything else into the middle. Points outside `include` are still positioned — they are
 * just not allowed to set the scale.
 *
 * `bandOffset` shifts a band up (+) or down (−) to leave room for a caption.
 */
export function toNdc(
	p: Projection,
	include?: (i: number) => boolean,
	bandOffset = 0
): { nx: Float32Array; ny: Float32Array } {
	const n = p.x.length;
	let x0 = Infinity;
	let x1 = -Infinity;
	let y0 = Infinity;
	let y1 = -Infinity;
	for (let i = 0; i < n; i++) {
		const x = p.x[i];
		const y = p.y[i];
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		if (include && !include(i)) continue;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
	}
	const nx = new Float32Array(n);
	const ny = new Float32Array(n);

	// Nothing finite to measure — leave everything at the origin rather than emit NaN.
	if (!Number.isFinite(x0)) return { nx, ny };

	if (p.band) {
		// x fills the range; y is a narrow band around the offset, carrying no information.
		const sx = 1.9 / Math.max(x1 - x0, 1e-9);
		const cx = (x0 + x1) / 2;
		for (let i = 0; i < n; i++) {
			nx[i] = (p.x[i] - cx) * sx;
			ny[i] = p.y[i] * 0.22 + bandOffset;
		}
	} else if (p.isometric) {
		// ONE scale for both axes: a map of a space must not distort distances.
		const s = 1.9 / Math.max(x1 - x0, y1 - y0, 1e-9);
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		for (let i = 0; i < n; i++) {
			nx[i] = (p.x[i] - cx) * s;
			ny[i] = (p.y[i] - cy) * s;
		}
	} else {
		// Two unrelated quantities: each axis fills its own range, so neither is wasted.
		const sx = 1.9 / Math.max(x1 - x0, 1e-9);
		const sy = 1.9 / Math.max(y1 - y0, 1e-9);
		const cx = (x0 + x1) / 2;
		const cy = (y0 + y1) / 2;
		for (let i = 0; i < n; i++) {
			nx[i] = (p.x[i] - cx) * sx;
			ny[i] = (p.y[i] - cy) * sy;
		}
	}
	return { nx, ny };
}

/**
 * A plot of two catalog quantities — the payoff for making position an input. Not wired to
 * any UI yet; it exists so the seam is demonstrably general rather than asserted to be, and
 * so adding an axis picker later is a change to a list of options, not to the renderer.
 */
export type FactAxis = 'weight' | 'rating' | 'geek' | 'year' | 'ratings';

const AXIS_LABEL: Record<FactAxis, string> = {
	weight: 'Complexity',
	rating: 'Average rating',
	geek: 'Geek rating',
	year: 'Year published',
	ratings: 'Ratings (log)'
};

/** Pull one fact column as data-space values; 0/absent becomes NaN so it is not drawn at 0. */
function axisValues(facts: GameFacts, axis: FactAxis): Float32Array {
	const src =
		axis === 'weight' ? facts.weight
		: axis === 'rating' ? facts.averageRating
		: axis === 'geek' ? facts.geekRating
		: axis === 'year' ? facts.year
		: facts.usersRated;
	const out = new Float32Array(src.length);
	for (let i = 0; i < src.length; i++) {
		const v = Number(src[i]);
		// These columns use 0 for "no value" (see alignFacts), which is a real position on
		// every one of these scales — so it has to become NaN, not a point at the origin.
		out[i] = v === 0 || !Number.isFinite(v) ? NaN : axis === 'ratings' ? Math.log10(v) : v;
	}
	return out;
}

export function factProjection(facts: GameFacts, x: FactAxis, y: FactAxis): Projection {
	return {
		x: axisValues(facts, x),
		y: axisValues(facts, y),
		xLabel: AXIS_LABEL[x],
		yLabel: AXIS_LABEL[y],
		// Two different quantities with different units — a shared scale would be meaningless.
		isometric: false,
		band: false
	};
}
