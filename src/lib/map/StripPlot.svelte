<script lang="ts">
  /**
   * One component of the embedding as a strip: every game's score on the x axis, jittered
   * vertically so the density reads, with a hand-picked set of games labelled. The tour
   * uses it to explain what a single dimension measures — "here is where the games you
   * know land on it".
   *
   * Dots on a canvas (36k of them), labels as HTML so they stay crisp and selectable in a
   * screenshot. Jitter is deterministic per game (hashed id → normal-ish noise) so the
   * picture is stable across redraws and steps.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import { readTheme, type MapTheme } from './palette';

  let {
    coords,
    facts,
    pc,
    labels = [],
    title = '',
    poles = ['', ''],
    minRatings = 30,
    labelSide = 'both',
    bandAt = 0.5
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    /** 1-based component. */
    pc: number;
    /** Game ids to label. */
    labels?: number[];
    /** PLACEHOLDER copy — the axis title. */
    title?: string;
    /** PLACEHOLDER copy — what the low and high ends mean. */
    poles?: [string, string];
    minRatings?: number;
    /** Stack labels on both sides of the band, or only above it (when something sits below). */
    labelSide?: 'both' | 'above';
    /** Where the band's centre sits, as a fraction of the plot height. */
    bandAt?: number;
  } = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let theme: MapTheme | null = $state(null);

  const PAD = { l: 24, r: 24, t: 48, b: 40 };
  const LABEL_H = 18;

  const xs = $derived(coords.pcs[pc - 1]);

  /** Full min–max with a little padding. The tails are the point of a strip — clipping to a
   * percentile (an earlier cut) pinned exactly the games worth labelling to the edge. */
  const domain = $derived.by(() => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < xs.length; i++) { const v = xs[i]; if (!Number.isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    const pad = (hi - lo) * 0.03;
    return [lo - pad, hi + pad] as [number, number];
  });
  const sx = $derived((v: number) => PAD.l + ((v - domain[0]) / (domain[1] - domain[0])) * (width - PAD.l - PAD.r));

  /** Deterministic, roughly normal jitter in [-1, 1] from the id. */
  function jitter(id: number): number {
    let h = (id * 2654435761) >>> 0;
    let s = 0;
    for (let k = 0; k < 4; k++) { h = (h ^ (h >>> 13)) * 1274126177 >>> 0; s += (h & 0xffff) / 0xffff; }
    return (s / 4 - 0.5) * 2 * 1.6; // sum of 4 uniforms ≈ normal; scaled so ±1 is ~2.5σ
  }

  // Band the strip occupies; labels stack above and below it.
  const band = $derived.by(() => {
    const mid = PAD.t + (height - PAD.t - PAD.b) * bandAt;
    const half = Math.max(24, Math.min(80, (height - PAD.t - PAD.b) * 0.18));
    return { mid, half };
  });

  $effect(() => { void width; void height; void theme; void xs; void minRatings; draw(); });

  function draw() {
    if (!canvas || !theme || width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // axis
    ctx.strokeStyle = theme.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, band.mid); ctx.lineTo(width - PAD.r, band.mid); ctx.stroke();
    ctx.globalAlpha = 1;
    const zero = sx(0);
    ctx.setLineDash([3, 4]); ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(zero, band.mid - band.half - 6); ctx.lineTo(zero, band.mid + band.half + 6); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // dots
    const labelled = new Set(labels);
    ctx.fillStyle = theme.muted; ctx.globalAlpha = 0.4;
    const n = coords.ids.length;
    for (let i = 0; i < n; i++) {
      const v = xs[i];
      if (!Number.isFinite(v)) continue;
      if (facts.upcoming[i] !== 1 && facts.usersRated[i] < minRatings) continue;
      if (labelled.has(coords.ids[i])) continue;
      const x = Math.max(PAD.l, Math.min(width - PAD.r, sx(v)));
      const y = band.mid + jitter(coords.ids[i]) * band.half;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    // Labelled games sit on the axis line itself — vertical position carries nothing, so
    // pinning them makes the x reading exact and lets the label attach right beside them.
    for (const id of labels) {
      const i = coords.index.get(id);
      if (i === undefined || !Number.isFinite(xs[i])) continue;
      const x = sx(xs[i]), y = band.mid;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.background; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent; ctx.fill();
    }
  }

  /**
   * Label layout, annotated-timeline style: labels sit just outside the band, alternating
   * above and below their dot, and step out to the next row only when the row nearest the
   * band is taken at that x. A label is never far from its dot; a short vertical leader
   * joins them. Good enough for a few dozen labels; not a general solver.
   */
  const placed = $derived.by(() => {
    if (width === 0) return [];
    const ctxW = (s: string) => Math.min(s.length * 6.4 + 8, 220);
    const items = labels
      .map((id) => ({ id, i: coords.index.get(id) }))
      .filter((r): r is { id: number; i: number } => r.i !== undefined && Number.isFinite(xs[r.i]))
      .map(({ id, i }) => ({ id, name: facts.name(id), x: sx(xs[i]), y: band.mid, w: 0 }))
      .sort((a, b) => a.x - b.x);
    for (const it of items) it.w = ctxW(it.name);
    const rows: { above: number[]; below: number[] } = { above: [], below: [] };
    type Side = 'above' | 'below';
    return items.map((it, k) => {
      const lx = Math.max(PAD.l + it.w / 2, Math.min(width - PAD.r - it.w / 2, it.x));
      const start = lx - it.w / 2, end = start + it.w;
      // Alternate sides, but take whichever side has the nearer free row.
      const prefer: Side[] = labelSide === 'above' ? ['above'] : k % 2 ? ['below', 'above'] : ['above', 'below'];
      let side: Side = prefer[0], row = Infinity;
      for (const sd of prefer) {
        const ends = rows[sd];
        let r = ends.findIndex((e) => e + 8 < start);
        if (r === -1) r = ends.length;
        if (r < row) { row = r; side = sd; }
      }
      while (rows[side].length <= row) rows[side].push(0);
      rows[side][row] = end;
      const ly = side === 'above'
        ? band.mid - band.half - 12 - row * LABEL_H
        : band.mid + band.half + 12 + row * LABEL_H;
      return { ...it, lx, ly, side, row, k };
    });
  });

  $effect(() => {
    theme = readTheme();
    const ro = new ResizeObserver(([e]) => { width = e.contentRect.width; height = e.contentRect.height; });
    ro.observe(host);
    const mo = new MutationObserver(() => { theme = readTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  });
</script>

<div class="strip" bind:this={host}>
  <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
  <div class="title">{title}</div>
  <div class="pole lo">← {poles[0]}</div>
  <div class="pole hi">{poles[1]} →</div>
  <svg class="leaders" {width} {height} aria-hidden="true">
    {#each placed as p (p.id)}
      <line x1={p.x} y1={p.y + (p.side === 'above' ? -6 : 6)} x2={p.lx} y2={p.side === 'above' ? p.ly + 8 : p.ly - 8} />
    {/each}
  </svg>
  {#each placed as p (p.id)}
    <span class="label" style:left="{p.lx}px" style:top="{p.ly}px">{p.name}</span>
  {/each}
</div>

<style>
  .strip { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--background); }
  canvas, .leaders { position: absolute; inset: 0; pointer-events: none; }
  .leaders line { stroke: var(--foreground); stroke-opacity: 0.35; stroke-width: 1; }
  .title {
    position: absolute; top: 0.75rem; left: 50%; transform: translateX(-50%);
    color: var(--foreground); font-weight: 650; font-size: 0.95rem; white-space: nowrap;
  }
  /* Pole labels share the title row: the title centred, an end label at each side. */
  .pole { position: absolute; top: 0.85rem; color: var(--muted-foreground); font-size: 0.8rem; max-width: 30%; }
  .pole.lo { left: 1.5rem; }
  .pole.hi { right: 1.5rem; text-align: right; }
  .label {
    position: absolute; transform: translate(-50%, -50%);
    font-size: 0.75rem; line-height: 1; color: var(--foreground); white-space: nowrap;
    padding: 0.1rem 0.3rem; border-radius: 3px;
    background: color-mix(in oklch, var(--background) 85%, transparent);
    pointer-events: none;
  }
</style>
