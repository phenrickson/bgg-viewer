<script lang="ts">
  /**
   * A scatter of the whole catalog, drawn on a Canvas.
   *
   * Canvas rather than SVG because the point count is ~30,000: that many DOM nodes is the
   * failure the Explore spec calls out by name, and it is not close — SVG dies well before
   * this. Not WebGL either, which only earns its complexity past ~100k points.
   *
   * Axes and labels stay in SVG on top, where text renders crisply and can be selected; only
   * the cloud itself is rasterised. Hit-testing is deliberately absent: these plots illustrate
   * a claim in prose rather than serving as a way to find a particular game, so there is no
   * tooltip to hang off a quadtree. Clicking through to a game is what Discover and Explore
   * are for.
   *
   * `color` is optional and drives a sequential ramp — one hue, varying lightness — because
   * the thing it encodes (a rating) is an ordered quantity. The categorical `--chart-N` tokens
   * would be exactly wrong here: five unrelated hues imply five kinds, not a scale.
   */
  let {
    points = [],
    xLabel,
    yLabel,
    xLog = false,
    colorLabel = null,
    height = 300,
    /** Tick values for the x axis, in DATA space (pre-log). */
    xTicks = [],
    yTicks = []
  }: {
    points?: { x: number; y: number; c?: number }[];
    xLabel: string;
    yLabel: string;
    /** Plot x on a log10 scale — for anything spanning orders of magnitude, like vote counts. */
    xLog?: boolean;
    colorLabel?: string | null;
    height?: number;
    xTicks?: number[];
    yTicks?: number[];
  } = $props();

  const PAD = { l: 44, r: 12, t: 10, b: 34 };

  let wrap = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let w = $state(0);

  $effect(() => {
    if (!wrap) return;
    const ro = new ResizeObserver(([e]) => (w = e.contentRect.width));
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  const tx = (v: number) => (xLog ? Math.log10(Math.max(1, v)) : v);

  /** Data-space extents, computed once per data change. */
  const ext = $derived.by(() => {
    if (!points.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    let c0 = Infinity, c1 = -Infinity;
    for (const p of points) {
      const px = tx(p.x);
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
      if (p.c != null) {
        if (p.c < c0) c0 = p.c;
        if (p.c > c1) c1 = p.c;
      }
    }
    return { x0, x1, y0, y1, c0, c1, hasC: c0 <= c1 };
  });

  const plotW = $derived(Math.max(0, w - PAD.l - PAD.r));
  const plotH = $derived(Math.max(0, height - PAD.t - PAD.b));

  const sx = (v: number) =>
    ext && ext.x1 > ext.x0 ? PAD.l + ((tx(v) - ext.x0) / (ext.x1 - ext.x0)) * plotW : PAD.l;
  const sy = (v: number) =>
    ext && ext.y1 > ext.y0 ? PAD.t + plotH - ((v - ext.y0) / (ext.y1 - ext.y0)) * plotH : PAD.t;

  /**
   * A sequential ramp in one hue: low values pale and desaturated, high values dark and
   * saturated. OKLCH so the steps are perceptually even — the same interpolation in sRGB
   * bunches its lightness at one end and reads as a broken scale.
   */
  function ramp(t: number): string {
    const u = Math.max(0, Math.min(1, t));
    const l = 0.86 - 0.34 * u;
    const c = 0.04 + 0.13 * u;
    return `oklch(${l} ${c} 250)`;
  }

  $effect(() => {
    const el = canvas;
    if (!el || !ext || !plotW || !plotH) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr);
    el.height = Math.round(height * dpr);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    /*
     * Alpha well below 1 so the cloud reads by accumulation: where thousands of games overlap
     * the colour builds, which is the density information a solid dot would destroy. Radius
     * stays small for the same reason.
     */
    const r = points.length > 12000 ? 1.1 : points.length > 4000 ? 1.5 : 2.2;
    const alpha = points.length > 12000 ? 0.18 : points.length > 4000 ? 0.3 : 0.5;
    ctx.globalAlpha = alpha;

    const single = !ext.hasC;
    if (single) ctx.fillStyle = 'oklch(0.62 0.14 250)';

    for (const p of points) {
      if (!single && p.c != null) {
        ctx.fillStyle = ramp(ext.c1 > ext.c0 ? (p.c - ext.c0) / (ext.c1 - ext.c0) : 0.5);
      }
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  const fmtX = (v: number) => (xLog ? (v >= 1000 ? `${v / 1000}k` : String(v)) : String(v));
</script>

<div class="wrap" bind:this={wrap} style:height="{height}px">
  {#if w > 0}
    <canvas bind:this={canvas} style:width="{w}px" style:height="{height}px"></canvas>
    <svg width={w} {height} aria-hidden="true">
      <!-- Frame -->
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + plotH} class="ax" />
      <line x1={PAD.l} y1={PAD.t + plotH} x2={PAD.l + plotW} y2={PAD.t + plotH} class="ax" />

      {#each yTicks as t (t)}
        <line x1={PAD.l} y1={sy(t)} x2={PAD.l + plotW} y2={sy(t)} class="grid" />
        <text x={PAD.l - 6} y={sy(t)} class="tick" text-anchor="end" dominant-baseline="middle">{t}</text>
      {/each}

      {#each xTicks as t (t)}
        <text x={sx(t)} y={PAD.t + plotH + 14} class="tick" text-anchor="middle">{fmtX(t)}</text>
      {/each}

      <text x={PAD.l + plotW / 2} y={height - 2} class="axl" text-anchor="middle">{xLabel}</text>
      <text
        class="axl"
        text-anchor="middle"
        transform="rotate(-90) translate({-(PAD.t + plotH / 2)} 11)"
      >{yLabel}</text>
    </svg>
  {/if}
</div>

{#if colorLabel && ext?.hasC}
  <div class="legend">
    <span>{colorLabel}</span>
    <span class="bar" aria-hidden="true"></span>
    <span class="ends"><i>{ext.c0.toFixed(1)}</i><i>{ext.c1.toFixed(1)}</i></span>
  </div>
{/if}

<style>
  .wrap { position: relative; width: 100%; min-width: 0; }
  canvas { position: absolute; inset: 0; display: block; }
  svg { position: absolute; inset: 0; overflow: visible; }

  .ax { stroke: var(--border); stroke-width: 1; }
  .grid { stroke: color-mix(in oklch, var(--border) 55%, transparent); stroke-width: 1; }
  .tick { fill: var(--muted-foreground); font-size: 10px; }
  .axl { fill: var(--muted-foreground); font-size: 11px; }

  .legend {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.72rem; color: var(--muted-foreground); margin-top: 0.4rem;
  }
  .bar {
    width: 7rem; height: 0.5rem; border-radius: 3px;
    background: linear-gradient(to right, oklch(0.86 0.04 250), oklch(0.52 0.17 250));
  }
  .ends { display: inline-flex; gap: 0.4rem; font-variant-numeric: tabular-nums; }
  .ends i { font-style: normal; }
</style>
