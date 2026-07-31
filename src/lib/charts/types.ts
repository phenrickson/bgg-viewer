/** Shared shapes for the micro-charts (`MiniHistogram`, `MiniColumns`). */

/** One bar: `v` is the bucket's *left edge* (continuous) or its value (discrete). */
export interface HistBin {
	v: number;
	n: number;
}

export type ColBin = HistBin;
