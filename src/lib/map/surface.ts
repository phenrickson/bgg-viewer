/**
 * The contract between `PointCanvas` (the WebGL substrate: one regl-scatterplot, its
 * camera, the overlay canvas) and a *layer* that drives it (the embedding map, the ego
 * network). A layer hands the canvas a `Driver` — positions and encodings for every point,
 * plus a painter for the overlay — and the canvas does the drawing, transitions, filtering
 * and framing. Because a canvas can be driven by one layer after another, swapping the
 * layer inside a mounted canvas animates the *same* points from one arrangement to the
 * next: that is how the map becomes a network and back.
 *
 * Every point index is stable across layers (it is the row in the coordinates artifact),
 * so a layer only ever talks in indices.
 */
import { getContext, setContext } from 'svelte';
import type { MapTheme } from './palette';

/** Point diameters are whole px so they can ride in regl's categorical size slot. */
export const MAX_DIAMETER = 20;

export interface OverlayApi {
	/** Screen position of a point, or null if it is off-canvas / not drawn. */
	screen: (i: number) => [number, number] | null;
	width: number;
	height: number;
	theme: MapTheme;
	/** Point under the pointer, -1 for none. */
	hovered: number;
	/** Whether the current positions have finished drawing (edges etc. wait for this). */
	drawn: boolean;
	/** The pointer is down and panning. A layer may skip its markers until release. */
	dragging: boolean;
}

export interface Line {
	x1: number; y1: number; x2: number; y2: number;
	color: [number, number, number, number];
	width: number;
}

export interface Driver {
	/** Positions in NDC, [-1, 1]. Same array identity ⇒ no positional transition. */
	x: Float32Array;
	y: Float32Array;
	/** Colour bucket per point, indexing `palette` (CSS colours; converted for regl). */
	colour: Uint8Array;
	palette: string[];
	/** Diameter in px per point, 1..MAX_DIAMETER. */
	size: Uint8Array;
	/** Indices to show. */
	visible: number[];
	/** Indices to frame (zoom to); null = the whole data square. */
	focus: number[] | null;
	/** Stretch the data square to the canvas width (the strip) instead of keeping it square. */
	stretch?: boolean;
	opacity?: number;
	/**
	 * Line segments in data space (NDC), drawn by regl beneath the points, so they pan and
	 * zoom with the camera at no per-frame cost. Colour is RGBA 0–1. They appear once the
	 * points have landed — mid-flight they'd join where the points are going.
	 */
	lines?: Line[];
	/** Paint over the points — rings, labels. Called on every camera change and draw. */
	overlay?: (ctx: CanvasRenderingContext2D, api: OverlayApi) => void;
	onhover?: (i: number) => void;
	/** regl's `select`: one point for a click, many for a lasso. */
	onselect?: (points: number[]) => void;
}

export interface ExportOptions {
	/** Multiple of the on-screen size; 4 on a ~1400px canvas is a ~5600px image. */
	scale: number;
	/** Drawn in the bottom-left corner, in the theme's ink. */
	title?: string;
	/** No background: the points and overlay on alpha, for print. */
	transparent?: boolean;
}

/** What a page gets from a canvas, for things a layer doesn't own. */
export interface CanvasApi {
	/**
	 * The largest export scale this canvas can render: WebGL framebuffers top out at 16384
	 * px a side (and the export is scale × CSS size × devicePixelRatio), and past ~40 MP
	 * the PNG encode freezes the page for a long time. Depends on the canvas size.
	 */
	maxExportScale: () => number;
	/**
	 * The current view — regl's points re-rendered at `scale`, the layer's overlay painted
	 * on top at the same scale (labels re-placed, so they stay crisp and uncluttered) — as
	 * a PNG. What you see is what you get: frame the shot by zooming first.
	 */
	exportPng: (o: ExportOptions) => Promise<Blob>;
}

/** What a layer gets from the canvas it is mounted in. */
export interface Surface {
	drive: (d: Driver) => void;
	release: (d: Driver) => void;
	/** Reactive: the hovered point, -1 for none. */
	readonly hovered: number;
	readonly theme: MapTheme | null;
	readonly width: number;
	readonly height: number;
	/** Ask for an overlay repaint (e.g. a layer's own state changed). */
	repaint: () => void;
}

const KEY = Symbol('point-canvas');
export const provideSurface = (s: Surface) => setContext(KEY, s);
export const useSurface = (): Surface | undefined => getContext<Surface | undefined>(KEY);
