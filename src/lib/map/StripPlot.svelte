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

  const PAD = { l: 24, r: 24, t: 56, b: 64 };
  const LABEL_H = 18;

  const xs = $derived(coords.pcs[pc - 1]);

  /** Symmetric domain around 0 clipped to the 0.1–99.9 percentile so a few outliers don't
   * squash the strip; the poles are what we want to read. */
  const domain = $derived.by(() => {
    const v = Array.from(xs).filter(Number.isFinite).sort((a, b) => a - b);
    const lo = v[Math.floor(v.length * 0.001)], hi = v[Math.floor(v.length * 0.999)];
    return [lo, hi] as [number, number];
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
    // labelled games on top, in the accent, with a halo
    for (const id of labels) {
      const i = coords.index.get(id);
      if (i === undefined || !Number.isFinite(xs[i])) continue;
      const x = sx(xs[i]), y = band.mid + jitter(id) * band.half;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.background; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent; ctx.fill();
    }
  }

  /**
   * Label layout: sort by x, alternate above/below the band, and within a side take the
   * lowest lane whose last label ends before this one starts. Leader lines join label to
   * dot. Good enough for a few dozen labels; not a general solver.
   */
  const placed = $derived.by(() => {
    if (width === 0) return [];
    const ctxW = (s: string) => Math.min(s.length * 6.4 + 8, 200);
    const items = labels
      .map((id) => ({ id, i: coords.index.get(id) }))
      .filter((r): r is { id: number; i: number } => r.i !== undefined && Number.isFinite(xs[r.i]))
      .map(({ id, i }) => ({ id, name: facts.name(id), x: sx(xs[i]), y: band.mid + jitter(id) * band.half, w: 0 }))
      .sort((a, b) => a.x - b.x);
    for (const it of items) it.w = ctxW(it.name);
    const lanes: { above: number[]; below: number[] } = { above: [], below: [] };
    return items.map((it, k) => {
      const side = labelSide === 'above' || it.y < band.mid ? 'above' : 'below';
      const ends = lanes[side];
      // Keep the label inside the plot first, then find a lane for where it actually is.
      const lx = Math.max(PAD.l + it.w / 2, Math.min(width - PAD.r - it.w / 2, it.x));
      const start = lx - it.w / 2;
      let lane = ends.findIndex((e) => e + 6 < start);
      if (lane === -1) { lane = ends.length; ends.push(0); }
      ends[lane] = start + it.w;
      const ly = side === 'above'
        ? band.mid - band.half - 14 - lane * LABEL_H
        : band.mid + band.half + 14 + lane * LABEL_H;
      return { ...it, lx, ly, side, k };
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
      <line x1={p.x} y1={p.y} x2={p.lx} y2={p.side === 'above' ? p.ly + 8 : p.ly - 8} />
    {/each}
  </svg>
  {#each placed as p (p.id)}
    <span class="label" style:left="{p.lx}px" style:top="{p.ly}px">{p.name}</span>
  {/each}
</div>

<style>
  .strip { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--background); }
  canvas, .leaders { position: absolute; inset: 0; pointer-events: none; }
  .leaders line { stroke: var(--muted-foreground); stroke-opacity: 0.45; stroke-width: 1; }
  .title {
    position: absolute; top: 0.75rem; left: 50%; transform: translateX(-50%);
    color: var(--foreground); font-weight: 650; font-size: 0.95rem; white-space: nowrap;
  }
  .pole {
    position: absolute; bottom: 2.6rem; color: var(--muted-foreground); font-size: 0.8rem;
    max-width: 45%;
  }
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
