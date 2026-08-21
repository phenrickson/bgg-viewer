<script lang="ts">
  /**
   * A scatter of the whole catalog, drawn on a Canvas.
   *
   * Canvas rather than SVG because the point count is ~30,000: that many DOM nodes is the
   * failure the Explore spec calls out by name, and it is not close — SVG dies well before
   * this. Not WebGL either, which only earns its complexity past ~100k points.
   *
   * Axes and labels stay in SVG on top, where text renders crisply and can be selected; only
   * the cloud itself is rasterised. Hit-testing (see `interactive` below) is opt-in and off by
   * default — About's clouds illustrate a claim in prose and have no per-game identity worth
   * surfacing, so there is no tooltip to hang off a quadtree there. The SVG overlay is
   * `pointer-events: none` regardless of `interactive`, so it never blocks the canvas
   * underneath from receiving hover/click.
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
     * Pin the axis to a fixed range instead of the plotted points' own min/max, in DATA space
     * (pre-log, like `xTicks`/`yTicks`). Without this, the axis auto-fits tightly to whatever
     * `points` currently holds — fine for a fixed population (About's whole-catalog charts),
     * but wrong wherever `points` is itself a filtered subset (Explore's analysis panel): the
     * domain would silently shift on every filter change while the tick LABELS stayed fixed
     * constants, so ticks drifted away from the positions their numbers claimed. Set this to
     * match `xTicks`/`yTicks`' own range to keep the axis stable regardless of how narrow the
     * current scope is.
     */
    xDomain = null,
    yDomain = null,
    /** Skip the `1.5k` compaction on x-axis tick labels — for an axis like a year, which only
     *  looks like a "thousands" value by coincidence, not because it needs compacting. */
    xPlain = false,
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
    annotations = [],
    /**
     * Off by default — About's clouds illustrate a claim in prose and have no per-game
     * identity worth surfacing. Explore's analysis panel is scoped to actual games in the
     * current filter, where "which game is that dot" is exactly the question a reader has,
     * so it opts in.
     */
    interactive = false,
    /** Resolves a hovered/clicked point's `game_id` to its name, for the tooltip. */
    pointName,
    /**
     * Called with a point's `game_id` when its pinned tooltip's "Go to" is clicked. A click on
     * the point itself only PINS the tooltip (see `pinnedIdx`) rather than navigating
     * immediately — a miss-click by a pixel in a dense cloud shouldn't cost the reader their
     * scroll position/filters on a redirect they didn't mean to trigger.
     */
    onPointClick
  }: {
    /**
     * `selected: false` draws a point as a faded backdrop instead of the normal cloud style —
     * for showing where a filtered set sits within the whole universe rather than only ever
     * drawing the narrowed set with nothing to compare it against. `true` or omitted draws
     * normally, so passing no `selected` field at all (the common case) is unaffected.
     */
    points?: { x: number; y: number; c?: number; game_id?: number; selected?: boolean }[];
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
    xDomain?: [number, number] | null;
    yDomain?: [number, number] | null;
    xPlain?: boolean;
    colorDomain?: [number, number] | null;
    colorPivot?: number | null;
    jitterX?: number;
    jitterY?: number;
    interactive?: boolean;
    pointName?: (id: number) => string | undefined;
    onPointClick?: (id: number) => void;
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

    // A pinned domain wins outright — it's the whole point of setting one: a stable axis
    // regardless of what the current (possibly filtered) `points` happen to span. Left exact,
    // not padded below: a caller who pins a domain usually wants it to match something else
    // (another chart, a fixed scale), so nudging it would defeat the point.
    if (xDomain) {
      x0 = tx(xDomain[0]);
      x1 = tx(xDomain[1]);
    } else {
      // A point sitting exactly at the extreme would otherwise render flush against the
      // plot's own clip rect (see the clip note below) — half the marker clipped off instead
      // of a full dot. 4% of the span on each side gives it room to sit inside the axis.
      const pad = (x1 - x0) * 0.04 || 0.5;
      x0 -= pad;
      x1 += pad;
    }
    if (yDomain) {
      y0 = ty(yDomain[0]);
      y1 = ty(yDomain[1]);
    } else {
      const pad = (y1 - y0) * 0.04 || 0.5;
      y0 -= pad;
      y1 += pad;
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

  /**
   * Deterministic jitter — a hash of the index rather than Math.random, so the cloud does
   * not reshuffle on every resize or re-render, which would read as the data changing.
   * Hoisted out of the draw effect so hit-testing (below) can place the cursor against the
   * exact same jittered positions the canvas actually drew.
   */
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return (s - Math.floor(s)) - 0.5; // −0.5 … +0.5
  };

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
    const single = !ext.hasC;

    /*
     * Clip to the plot rectangle before drawing. Without it, a point whose jitter pushes it
     * past the domain edge (a weight of exactly 1.0 jittered to 0.96, say) — or, with a
     * pinned `xDomain`/`yDomain`, any point genuinely outside that fixed range — renders past
     * the axis line and into the label gutter instead of just not being drawn there. The axis
     * should show only what's inside the domain it draws, not a mess bleeding past its edges.
     */
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.l, PAD.t, plotW, plotH);
    ctx.clip();

    const jitter = (i: number) => ({
      jx: jitterX ? rand(i, 1) * jitterX : 0,
      jy: jitterY ? rand(i, 2) * jitterY : 0
    });

    /*
     * Backdrop pass — the whole universe, faded, drawn first so the highlighted set sits on
     * top of it rather than under it. Flat muted colour regardless of `c`: a colour-scale
     * ramp on a backdrop the reader isn't meant to read closely would just be visual noise.
     * Only runs when the data actually distinguishes selected/unselected — the common case
     * (no `selected` field at all) skips straight to the normal single-pass draw below.
     */
    const hasSelection = points.some((p) => p.selected === false);
    if (hasSelection) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = 'oklch(0.55 0.015 250)';
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.selected !== false) continue;
        const { jx, jy } = jitter(i);
        ctx.beginPath();
        ctx.arc(sx(p.x + jx), sy(p.y + jy), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /*
     * Foreground pass — everything selected (or, with no selection data at all, everything).
     * Alpha below 1 so the cloud reads by accumulation: where thousands of games overlap the
     * colour builds, which is the density a solid dot destroys. The first pass used r≈1.1 at
     * this count and the points were too small to see at all — legibility first, then let the
     * alpha carry the density.
     */
    ctx.globalAlpha = points.length > 12000 ? 0.28 : points.length > 4000 ? 0.38 : 0.55;
    if (single) ctx.fillStyle = 'oklch(0.62 0.14 250)';
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.selected === false) continue;
      if (!single && p.c != null) ctx.fillStyle = ramp(p.c);
      const { jx, jy } = jitter(i);
      ctx.beginPath();
      ctx.arc(sx(p.x + jx), sy(p.y + jy), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  });

  const fmt = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));
  const fmtX = (v: number) => (xPlain ? String(v) : fmt(v));
  /** Tooltip values are raw data (ratings, weights), not tick labels — round rather than
      dump float noise like "7.234000000001". */
  const fmtTip = (v: number) => (v >= 1000 ? `${Math.round(v).toLocaleString()}` : v.toFixed(2));

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

  /**
   * Hover/click hit-testing — a plain nearest-point scan against the same jittered screen
   * positions the canvas drew (see `rand` above). 60k points × a distance check is a
   * sub-millisecond loop, so no spatial index is worth the complexity here; `rAF`-throttled
   * so a fast mousemove can't queue more scans than frames to show them in.
   */
  const HIT_RADIUS = 8;
  let hoverIdx = $state<number | null>(null);
  /**
   * A click pins the tooltip on a point instead of navigating immediately — the game name a
   * dense cloud resolves to is easy to click past by a pixel, and an instant redirect made a
   * miss-click expensive (losing the panel's filters/scroll position). Pinned, the tooltip
   * survives the pointer leaving (unlike hover) and offers a "Go to" the click actually
   * commits to.
   */
  let pinnedIdx = $state<number | null>(null);
  let hoverPending: { x: number; y: number } | null = null;
  let hoverRaf = 0;

  function nearest(px: number, py: number): number | null {
    let best = -1;
    let bestD = HIT_RADIUS * HIT_RADIUS;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const jx = jitterX ? rand(i, 1) * jitterX : 0;
      const jy = jitterY ? rand(i, 2) * jitterY : 0;
      const dx = sx(p.x + jx) - px;
      const dy = sy(p.y + jy) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best === -1 ? null : best;
  }

  function onPointerMove(e: PointerEvent) {
    if (!interactive || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    hoverPending = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (hoverPending) hoverIdx = nearest(hoverPending.x, hoverPending.y);
    });
  }

  function onPointerLeave() {
    hoverPending = null;
    hoverIdx = null;
    // pinnedIdx deliberately survives — that's the point of pinning.
  }

  /** Click a point to pin its tooltip; click the same one again (or empty space) to unpin. */
  function handleClick() {
    pinnedIdx = hoverIdx != null && hoverIdx === pinnedIdx ? null : hoverIdx;
  }

  function goToPinned() {
    if (pinnedIdx == null) return;
    const id = points[pinnedIdx]?.game_id;
    if (id != null && onPointClick) onPointClick(id);
  }

  const displayIdx = $derived(pinnedIdx ?? hoverIdx);
  const hoverPoint = $derived(displayIdx != null ? points[displayIdx] : null);
  const hoverLabel = $derived(
    hoverPoint?.game_id != null ? pointName?.(hoverPoint.game_id) : undefined
  );
  /** Same jittered screen position `nearest()` matched against, not the raw data point —
      otherwise the ring sits slightly off the dot it's marking whenever jitter is in play. */
  const hoverPos = $derived.by(() => {
    if (hoverPoint == null || displayIdx == null) return null;
    const jx = jitterX ? rand(displayIdx, 1) * jitterX : 0;
    const jy = jitterY ? rand(displayIdx, 2) * jitterY : 0;
    return { x: sx(hoverPoint.x + jx), y: sy(hoverPoint.y + jy) };
  });
</script>

<!-- Chart and key side by side, the key vertical on the right — the conventional place for a
     colour scale, beside the thing it describes. Printed below the plot it was read after the
     cloud, and at the foot of a 440px figure it was nowhere near it. -->
<div class="row">
<div class="wrap" bind:this={wrap} style:height="{height}px">
  {#if w > 0}
    <canvas
      bind:this={canvas}
      style:width="{w}px"
      style:height="{height}px"
      class:interactive
      class:clickable={interactive && hoverIdx != null && onPointClick}
      onpointermove={interactive ? onPointerMove : undefined}
      onpointerleave={interactive ? onPointerLeave : undefined}
      onclick={interactive ? handleClick : undefined}
    ></canvas>
    <svg width={w} {height} aria-hidden="true">
      {#if hoverPos}
        <circle cx={hoverPos.x} cy={hoverPos.y} r="5.5" class="hoverring" />
      {/if}
      <!-- Frame -->
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + plotH} class="ax" />
      <line x1={PAD.l} y1={PAD.t + plotH} x2={PAD.l + plotW} y2={PAD.t + plotH} class="ax" />

      {#each yTicks as t (t)}
        <line x1={PAD.l} y1={sy(t)} x2={PAD.l + plotW} y2={sy(t)} class="grid" />
        <text x={PAD.l - 6} y={sy(t)} class="tick" text-anchor="end" dominant-baseline="middle">{fmt(t)}</text>
      {/each}

      {#each xTicks as t (t)}
        <text x={sx(t)} y={PAD.t + plotH + 14} class="tick" text-anchor="middle">{fmtX(t)}</text>
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
    {#if hoverPos && hoverPoint}
      <div class="tip" class:pinned={pinnedIdx != null}>
        {#if hoverLabel}<b>{hoverLabel}</b>{/if}
        <span>{xLabel}: {fmtTip(hoverPoint.x)} · {yLabel}: {fmtTip(hoverPoint.y)}</span>
        {#if pinnedIdx != null}
          <span class="tipactions">
            {#if onPointClick}<button type="button" onclick={goToPinned}>Go to →</button>{/if}
            <button type="button" class="dismiss" onclick={() => (pinnedIdx = null)} aria-label="Close"
              >✕</button
            >
          </span>
        {/if}
      </div>
    {/if}
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
  canvas.interactive { touch-action: none; }
  canvas.clickable { cursor: pointer; }

  .hoverring {
    fill: none;
    stroke: var(--primary);
    stroke-width: 2;
  }

  /* A fixed readout in the plot's corner, not a floating box chasing the cursor. A tooltip
     anchored to the point itself has to dodge every edge (flip left/right, clamp top/bottom,
     account for its own measured width) — fiddly math that was visibly drifting off-target
     for points near an edge. A fixed corner needs none of that: it can't overflow, can't
     drift, and the orange ring on the point itself already answers "which one" — the readout
     only needs to answer "what is it," which doesn't require being adjacent to it. */
  .tip {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    max-width: min(16rem, calc(100% - 1rem));
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    background: var(--popover, var(--card));
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px color-mix(in oklch, black 18%, transparent);
    font-size: 0.72rem;
    line-height: 1.3;
    z-index: 1;
  }
  .tip b {
    font-size: 0.76rem;
    font-weight: 650;
    color: var(--foreground);
  }
  .tip span {
    color: var(--muted-foreground);
  }
  /* Pinned (clicked, not just hovered) — it needs to be clickable itself now, for the "Go to"
     and close buttons a plain hover preview doesn't have. */
  .tip.pinned {
    pointer-events: auto;
  }
  .tipactions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.15rem;
  }
  .tipactions button {
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
    font: inherit;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
  }
  .tipactions button:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .tipactions .dismiss {
    color: var(--muted-foreground);
  }
  /* NOT `overflow: visible`: with it the rotated y-axis label escaped the figure and the
     x-axis label collided with the heading of the section below. The padding box already
     reserves room for both. */
  /* pointer-events: none — without it this decorative overlay (axes/ticks/labels) sits on
     top of the canvas and silently eats every hover/click across its FULL bounding box, even
     over the empty space between gridlines. That's what made `interactive` a no-op: the
     canvas's own pointermove/click handlers never fired, because the svg intercepted first. */
  svg { position: absolute; inset: 0; pointer-events: none; }

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
