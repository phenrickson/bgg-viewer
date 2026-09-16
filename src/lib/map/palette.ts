/**
 * Resolve the map's colours from the design tokens on `:root` at draw time, so the canvas
 * (which can't use `var(--x)`) follows the theme exactly and dark mode needs no branch —
 * mode-watcher swaps the tokens, the next draw picks them up.
 */
import type { Palette } from './scales';

export interface MapTheme extends Palette {
	background: string;
	foreground: string;
	font: string;
}

export function readTheme(el: Element = document.documentElement): MapTheme {
	const cs = getComputedStyle(el);
	const v = (name: string) => cs.getPropertyValue(name).trim();
	return {
		chart: [1, 2, 3, 4, 5, 6].map((i) => v(`--chart-${i}`)),
		ramp: [v('--map-ramp-lo'), v('--map-ramp-hi')],
		muted: v('--muted-foreground'),
		accent: v('--primary'),
		background: v('--background'),
		foreground: v('--foreground'),
		font: cs.fontFamily || 'system-ui, sans-serif'
	};
}
