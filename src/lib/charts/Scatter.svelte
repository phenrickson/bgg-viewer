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
   * `c` is optional and drives a colour ramp — sequential by default, diverging when a
   * `colorPivot` is given. Either way it is a *scale*, so the categorical `--chart-N` tokens
   * would be exactly wrong: five unrelated hues imply five kinds, not an ordering.
   *
   * `jitterX`/`jitterY` exist because community votes land on round numbers. Complexity in
   * particular piles thousands of games on exactly 2.0 and 3.0, which draws as a hard vertical
   * stripe and hides the density behind it; a sub-bin displacement recovers the shape without
   * changing what the plot says.
   */
  let {
    points = [],
    xLabel,
    yLabel,
    xLog = false,
    yLog = false,
    colorLabel = null,
    height = 300,
    /** Tick values for the x axis, in DATA space (pre-log). */
    xTicks = [],
    yTicks = [],
    /**
     * Clamp the colour scale to this window. Without it the ramp stretches to the data's true
     * extremes and a handful of outliers flatten everything else into one indistinguishable
     * shade — most of the catalog sits in a narrow band, so the interesting variation is
     * inside it, not across the full range.
     */
    colorDomain = null,
    /**
     * Pivot for a diverging ramp: below it runs cool, above it runs warm. Only meaningful
     * when the midpoint itself means something ("worse than / better than"); leave null for a
     * plain sequential ramp.
     */
    colorPivot = null,
    /**
     * Random displacement applied to each point, in DATA units, to break up ties. Community
     * votes land on round numbers, so thousands of games share an exact x — drawn faithfully
     * they stack into a hard vertical line that hides the density behind it.
     */
    jitterX = 0,
    jitterY = 0,
    annotations = []
  }: {
    points?: { x: number; y: number; c?: number }[];
    /**
     * Named points called out on top of the cloud. A few hundred anonymous dots state a shape
     * but no fact you can hold onto; naming half a dozen of them turns the plot into something
     * you can read a claim off. Drawn in the SVG layer, so the labels stay crisp text and the
     * canvas cloud path is untouched.
     */
    annotations?: { x: number; y: number; label: string }[];
    xLabel: string;
    yLabel: string;
    /** Plot on a log10 scale — for anything spanning orders of magnitude, like vote counts. */
    xLog?: boolean;
    yLog?: boolean;
    colorLabel?: string | null;
    height?: number;
    xTicks?: number[];
    yTicks?: number[];
    colorDomain?: [number, number] | null;
    colorPivot?: number | null;
    jitterX?: number;
    jitterY?: number;
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
  const ty = (v: number) => (yLog ? Math.log10(Math.max(1, v)) : v);

  /** Data-space extents, computed once per data change. */
  const ext = $derived.by(() => {
    if (!points.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    let c0 = Infinity, c1 = -Infinity;
    for (const p of points) {
      const px = tx(p.x);
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      const py = ty(p.y);
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      if (p.c != null) {
        if (p.c < c0) c0 = p.c;
        if (p.c > c1) c1 = p.c;
      }
    }
    /*
     * Annotations widen the domain. They are frequently NOT drawn from the plotted sample —
     * a cloud may be a stratified sample while the named points are chosen for recognition —
     * so a called-out game can sit outside the sample's own range. Left out of the extent it
     * would be scaled off the plot and silently clipped by the svg's `overflow: hidden`:
     * Monopoly's 4.29 geek rating against a sample floor of 5.32 was exactly this.
     */
    for (const a of annotations) {
      const ax = tx(a.x);
      const ay = ty(a.y);
      if (ax < x0) x0 = ax;
      if (ax > x1) x1 = ax;
      if (ay < y0) y0 = ay;
      if (ay > y1) y1 = ay;
    }

    return { x0, x1, y0, y1, c0, c1, hasC: c0 <= c1 };
  });

  const plotW = $derived(Math.max(0, w - PAD.l - PAD.r));
  const plotH = $derived(Math.max(0, height - PAD.t - PAD.b));

  const sx = (v: number) =>
    ext && ext.x1 > ext.x0 ? PAD.l + ((tx(v) - ext.x0) / (ext.x1 - ext.x0)) * plotW : PAD.l;
  const sy = (v: number) =>
    ext && ext.y1 > ext.y0 ? PAD.t + plotH - ((ty(v) - ext.y0) / (ext.y1 - ext.y0)) * plotH : PAD.t;

  /** The window the colour scale spans — the caller's clamp, or the data's own range. */
  const cdom = $derived.by((): [number, number] => {
    if (colorDomain) return colorDomain;
    return ext && ext.hasC ? [ext.c0, ext.c1] : [0, 1];
  });

  /**
   * Sequential: one hue, pale-and-desaturated to dark-and-saturated.
   *
   * OKLCH so the steps are perceptually even. The same interpolation in sRGB bunches its
   * lightness at one end and reads as a broken scale.
   */
  function seq(u: number): string {
    return `oklch(${0.86 - 0.34 * u} ${0.04 + 0.13 * u} 250)`;
  }

  /**
   * Diverging: rose below the pivot, blue above, pale where the two meet.
   *
   * Only correct when the midpoint carries meaning — here it separates "rated worse than
   * average" from "better". Both arms are colourblind-safe against each other (rose/blue,
   * not red/green), and lightness carries the magnitude on both sides so the scale survives
   * greyscale.
   */
  function div(u: number): string {
    const d = Math.abs(u - 0.5) * 2; // 0 at the pivot, 1 at either end
    const hue = u < 0.5 ? 25 : 250;
    return `oklch(${0.85 - 0.3 * d} ${0.03 + 0.14 * d} ${hue})`;
  }

  function ramp(v: number): string {
    const [lo, hi] = cdom;
    const u = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0.5;
    return colorPivot == null ? seq(u) : div(u);
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
     * Alpha below 1 so the cloud reads by accumulation: where thousands of games overlap the
     * colour builds, which is the density a solid dot destroys. The first pass used r≈1.1 at
     * this count and the points were too small to see at all — legibility first, then let the
     * alpha carry the density.
     */
    const r = points.length > 12000 ? 2 : points.length > 4000 ? 2.6 : 3.2;
    ctx.globalAlpha = points.length > 12000 ? 0.28 : points.length > 4000 ? 0.38 : 0.55;

    const single = !ext.hasC;
    if (single) ctx.fillStyle = 'oklch(0.62 0.14 250)';

    /*
     * Deterministic jitter — a hash of the index rather than Math.random, so the cloud does
     * not reshuffle on every resize or re-render, which would read as the data changing.
     */
    const rand = (i: number, salt: number) => {
      const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
      return (s - Math.floor(s)) - 0.5; // −0.5 … +0.5
    };

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!single && p.c != null) ctx.fillStyle = ramp(p.c);
      const jx = jitterX ? rand(i, 1) * jitterX : 0;
      const jy = jitterY ? rand(i, 2) * jitterY : 0;
      ctx.beginPath();
      ctx.arc(sx(p.x + jx), sy(p.y + jy), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  const fmt = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));

  /**
   * Place each annotation's text, flipping it to the left of its dot when the label would
   * otherwise run past the plot's right edge. The svg is `overflow: hidden` (see the note on
   * the y-axis label below), so an unflipped label near the edge is silently truncated rather
   * than merely ugly. 6.2px/char approximates the 11px label font well enough to decide.
   */
  const placed = $derived.by(() =>
    annotations.map((a) => {
      const px = sx(a.x);
      const py = sy(a.y);
      const flip = px + a.label.length * 6.2 + 10 > PAD.l + plotW;
      return { ...a, px, py, flip, tx: flip ? px - 7 : px + 7 };
    })
  );
</script>

<!-- Chart and key side by side, the key vertical on the right — the conventional place for a
     colour scale, beside the thing it describes. Printed below the plot it was read after the
     cloud, and at the foot of a 440px figure it was nowhere near it. -->
<div class="row">
<div class="wrap" bind:this={wrap} style:height="{height}px">
  {#if w > 0}
    <canvas bind:this={canvas} style:width="{w}px" style:height="{height}px"></canvas>
    <svg width={w} {height} aria-hidden="true">
      <!-- Frame -->
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + plotH} class="ax" />
      <line x1={PAD.l} y1={PAD.t + plotH} x2={PAD.l + plotW} y2={PAD.t + plotH} class="ax" />

      {#each yTicks as t (t)}
        <line x1={PAD.l} y1={sy(t)} x2={PAD.l + plotW} y2={sy(t)} class="grid" />
        <text x={PAD.l - 6} y={sy(t)} class="tick" text-anchor="end" dominant-baseline="middle">{fmt(t)}</text>
      {/each}

      {#each xTicks as t (t)}
        <text x={sx(t)} y={PAD.t + plotH + 14} class="tick" text-anchor="middle">{fmt(t)}</text>
      {/each}

      <!-- Named points, above the grid and below nothing. Each label gets a stroked copy
           underneath so it stays readable where it crosses the densest part of the cloud —
           a halo, rather than a background box that would blank out the very points it sits on. -->
      {#each placed as a (a.label)}
        <circle cx={a.px} cy={a.py} r="4.5" class="anndot" />
        <text
          x={a.tx}
          y={a.py}
          class="annlabel halo"
          text-anchor={a.flip ? 'end' : 'start'}
          dominant-baseline="middle">{a.label}</text>
        <text
          x={a.tx}
          y={a.py}
          class="annlabel"
          text-anchor={a.flip ? 'end' : 'start'}
          dominant-baseline="middle">{a.label}</text>
      {/each}

      <text x={PAD.l + plotW / 2} y={height - 4} class="axl" text-anchor="middle">{xLabel}</text>
      <text
        class="axl"
        text-anchor="middle"
        transform="rotate(-90 11 {PAD.t + plotH / 2})"
        x="11"
        y={PAD.t + plotH / 2}
        dominant-baseline="hanging"
      >{yLabel}</text>
    </svg>
  {/if}
</div>

{#if colorLabel && ext?.hasC}
  <div class="legend" style:height="{height}px">
    <span class="lgl">{colorLabel}</span>
    <span class="scale">
      <i>{cdom[1].toFixed(1)}{colorDomain ? '+' : ''}</i>
      <!-- Generated from the same functions that colour the points, so the key cannot drift
           from the cloud it describes. `to top`, so high sits at the top as it does on an axis. -->
      <span
        class="bar"
        aria-hidden="true"
        style:background="linear-gradient(to top, {Array.from({ length: 9 }, (_, i) =>
          colorPivot == null ? seq(i / 8) : div(i / 8)
        ).join(', ')})"
      ></span>
      <i>{cdom[0].toFixed(1)}{colorDomain ? '−' : ''}</i>
    </span>
  </div>
{/if}
</div>

<style>
  .wrap { position: relative; width: 100%; min-width: 0; }
  canvas { position: absolute; inset: 0; display: block; }
  /* NOT `overflow: visible`: with it the rotated y-axis label escaped the figure and the
     x-axis label collided with the heading of the section below. The padding box already
     reserves room for both. */
  svg { position: absolute; inset: 0; }

  .ax { stroke: var(--border); stroke-width: 1; }
  .grid { stroke: color-mix(in oklch, var(--border) 55%, transparent); stroke-width: 1; }
  .tick { fill: var(--muted-foreground); font-size: 10px; }
  .axl { fill: var(--muted-foreground); font-size: 11px; }

  /* `--primary` rather than a chart hue: these are the marked points, and primary is what
     this app already uses for "this is the one to look at". The ring separates the dot from
     the cloud it sits in, which is the same colour family underneath. */
  .anndot { fill: var(--primary); stroke: var(--background); stroke-width: 1.5; }
  .annlabel { fill: var(--foreground); font-size: 11px; font-weight: 600; }
  .halo { stroke: var(--background); stroke-width: 3.5; stroke-linejoin: round; paint-order: stroke; }

  /* The chart takes the width; the key is a fixed narrow column beside it. */
  .row { display: flex; gap: var(--space-md); align-items: stretch; min-width: 0; }
  .row > .wrap { flex: 1; min-width: 0; }

  /* Label reads horizontally at the top; the gradient runs vertically beneath it. */
  .legend {
    flex: none; display: flex; flex-direction: column; align-items: center; gap: 0.45rem;
    font-size: 0.72rem; color: var(--muted-foreground);
    padding: 0.6rem 0;
  }
  .lgl { font-weight: 600; white-space: nowrap; }
  .scale { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; flex: 1; }
  .scale i { font-style: normal; font-variant-numeric: tabular-nums; }
  .bar { width: 0.6rem; flex: 1; min-height: 4rem; border-radius: 3px; }
</style>
