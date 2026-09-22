/** The pure placement strategy only — the d3-selection component in the package index isn't used. */
declare module '@d3fc/d3fc-label-layout/src/greedy.js' {
	export interface LayoutRect {
		x: number;
		y: number;
		width: number;
		height: number;
		hidden?: boolean;
		location?: string;
	}
	export interface GreedyStrategy {
		(rects: LayoutRect[]): LayoutRect[];
		bounds(): LayoutRect | undefined;
		bounds(b: { x: number; y: number; width: number; height: number }): GreedyStrategy;
	}
	export default function layoutGreedy(): GreedyStrategy;
}
