/** Overlay-canvas primitives shared by the layers: dots, rings and label chips in theme ink. */
import { placeLabels, type LabelInput, type PlacedLabel } from './labels';

/** A filled point with a background halo — a marker drawn on top of the cloud. */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, fill: string, halo: string) {
	ctx.beginPath(); ctx.arc(x, y, rad + 1.5, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
	ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}

/** A radial fade in `colour` — a soft halo behind a point. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, colour: string, alpha: number) {
	const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
	g.addColorStop(0, colour); g.addColorStop(1, 'transparent');
	ctx.globalAlpha = alpha; ctx.fillStyle = g;
	ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
	ctx.globalAlpha = 1;
}

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, stroke: string, halo: string, w = 1.5) {
	ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
	ctx.lineWidth = w + 2; ctx.strokeStyle = halo; ctx.stroke();
	ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
}

const LINE_HEIGHT = 14, PAD_X = 4, PAD_Y = 2, MAX_WIDTH = 150;
/** The label box geometry `labels` uses, for a caller placing things against a placed label. */
export const LABEL_METRICS = { lineHeight: LINE_HEIGHT, padX: PAD_X, padY: PAD_Y } as const;

/** Place `want` so labels avoid each other and the edges (see labels.ts), then paint each
 * as wrapped text: on a translucent chip (legible over dense dots without hiding them),
 * or, with `chip: false`, as bare text with a stroked halo. */
export function labels(ctx: CanvasRenderingContext2D, want: LabelInput[], width: number, height: number, ink: string, halo: string, opts: { chip?: boolean; drop?: boolean } = {}): PlacedLabel[] {
	const placed = placeLabels(
		want,
		{ measure: (s) => ctx.measureText(s).width, lineHeight: LINE_HEIGHT, maxWidth: MAX_WIDTH, padX: PAD_X, padY: PAD_Y },
		{ x: 0, y: 0, width, height },
		{ drop: opts.drop }
	);
	const chip = opts.chip ?? true;
	for (const p of placed) {
		if (chip) {
			ctx.globalAlpha = 0.82; ctx.fillStyle = halo;
			ctx.beginPath(); ctx.roundRect(p.bx, p.by, p.bw, p.bh, 3); ctx.fill();
			ctx.globalAlpha = 1;
		}
		ctx.fillStyle = ink; ctx.textBaseline = 'middle';
		ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = halo;
		p.lines.forEach((t, k) => {
			const x = p.bx + PAD_X, y = p.by + PAD_Y + LINE_HEIGHT * (k + 0.5);
			if (!chip) ctx.strokeText(t, x, y);
			ctx.fillText(t, x, y);
		});
	}
	return placed;
}

/**
 * The opening's title: one label, placed as `item.text` ("Name (year)") would be, drawn as
 * two parts that fade in apart, the first `head` characters (the name) at `a` and the rest
 * (the year) at `b`. The chosen game is named first, then dated, before anything else moves
 * (Phil, 2026-11-11). Halo text, as the layers' labels are (`chip: false`).
 */
export function titleIn(ctx: CanvasRenderingContext2D, item: LabelInput, head: number, a: number, b: number, width: number, height: number, ink: string, halo: string): void {
	const [p] = placeLabels(
		[item],
		{ measure: (s) => ctx.measureText(s).width, lineHeight: LINE_HEIGHT, maxWidth: MAX_WIDTH, padX: PAD_X, padY: PAD_Y },
		{ x: 0, y: 0, width, height },
		{ drop: true }
	);
	if (!p) return;
	ctx.save();
	ctx.fillStyle = ink; ctx.textBaseline = 'middle';
	ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = halo;
	const put = (t: string, x: number, y: number, alpha: number) => {
		if (!t || alpha <= 0) return;
		ctx.globalAlpha = alpha;
		ctx.strokeText(t, x, y);
		ctx.fillText(t, x, y);
	};
	let left = head;
	p.lines.forEach((t, k) => {
		const x = p.bx + PAD_X, y = p.by + PAD_Y + LINE_HEIGHT * (k + 0.5);
		const n = Math.max(0, Math.min(t.length, left));
		put(t.slice(0, n), x, y, a);
		put(t.slice(n), x + ctx.measureText(t.slice(0, n)).width, y, b);
		left -= t.length + 1; // the space the wrap took between lines
	});
	ctx.restore();
}
