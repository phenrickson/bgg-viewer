/** Overlay-canvas primitives shared by the layers: dots, rings and label chips in theme ink. */
import { placeLabels, type LabelInput, type PlacedLabel } from './labels';

/** A filled point with a background halo — a marker drawn on top of the cloud. */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, fill: string, halo: string) {
	ctx.beginPath(); ctx.arc(x, y, rad + 1.5, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
	ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, stroke: string, halo: string, w = 1.5) {
	ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
	ctx.lineWidth = w + 2; ctx.strokeStyle = halo; ctx.stroke();
	ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
}

const LINE_HEIGHT = 14, PAD_X = 4, PAD_Y = 2, MAX_WIDTH = 150;

/** Place `want` so labels avoid each other and the edges (see labels.ts), then paint each
 * as wrapped text on a translucent chip — legible over dots without hiding them. */
export function labels(ctx: CanvasRenderingContext2D, want: LabelInput[], width: number, height: number, ink: string, halo: string): PlacedLabel[] {
	const placed = placeLabels(
		want,
		{ measure: (s) => ctx.measureText(s).width, lineHeight: LINE_HEIGHT, maxWidth: MAX_WIDTH, padX: PAD_X, padY: PAD_Y },
		{ x: 0, y: 0, width, height }
	);
	for (const p of placed) {
		ctx.globalAlpha = 0.82; ctx.fillStyle = halo;
		ctx.beginPath(); ctx.roundRect(p.bx, p.by, p.bw, p.bh, 3); ctx.fill();
		ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textBaseline = 'middle';
		p.lines.forEach((t, k) => ctx.fillText(t, p.bx + PAD_X, p.by + PAD_Y + LINE_HEIGHT * (k + 0.5)));
	}
	return placed;
}
