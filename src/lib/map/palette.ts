/**
 * Resolve the map's colours from the design tokens on `:root` at draw time, so the canvas
 * (which can't use `var(--x)`) follows the theme exactly and dark mode needs no branch —
 * mode-watcher swaps the tokens, the next draw picks them up.
 */
import type { Palette } from './scales';

export interface MapTheme extends Palette {
	background: string;
	foreground: string;
	/** `--map-context` — the tone out-of-scope points are drawn in. See `toContext`. */
	context: string;
	font: string;
}

export function readTheme(el: Element = document.documentElement): MapTheme {
	const cs = getComputedStyle(el);
	const v = (name: string) => cs.getPropertyValue(name).trim();
	return {
		chart: [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--map-cat-${i}`)),
		ramp: [v('--map-ramp-lo'), v('--map-ramp-hi')],
		muted: v('--muted-foreground'),
		other: v('--map-cat-other'),
		accent: v('--primary'),
		background: v('--background'),
		foreground: v('--foreground'),
		context: v('--map-context'),
		font: cs.fontFamily || 'system-ui, sans-serif'
	};
}

/**
 * Resolve any CSS colour (oklch tokens included) to an `rgb` triple in 0–255 by letting the
 * browser paint it. regl-scatterplot wants hex/RGB, not CSS strings.
 */
let probe: CanvasRenderingContext2D | null = null;
export function toRgb(css: string): [number, number, number] {
	probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (!probe) return [128, 128, 128];
	probe.clearRect(0, 0, 1, 1);
	probe.fillStyle = css;
	probe.fillRect(0, 0, 1, 1);
	const d = probe.getImageData(0, 0, 1, 1).data;
	return [d[0], d[1], d[2]];
}

export function toHex(css: string): string {
	return '#' + toRgb(css).map((c) => c.toString(16).padStart(2, '0')).join('');
}
