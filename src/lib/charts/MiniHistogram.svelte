<script lang="ts">
  /**
   * A small histogram you filter by dragging across it.
   *
   * Two series share the frame: `backdrop` (the whole universe) as a muted silhouette and
   * `bins` (the current scope) as solid bars, both mapped through one scale — see `scale.ts`,
   * which exists because the obvious alternative (each series to its own peak) draws a subset
   * taller than the set it came from.
   *
   * Drag across the plot to set the range; a click (no drag) or the ✕ clears it. Brushing to
   * an outer edge emits `null` for that bound, i.e. "no limit" — so dragging past the left
   * edge means "everything up to here" rather than pinning a bound at the drawn minimum.
   *
   * Raw SVG rather than LayerChart: at ~40 bins with a custom pointer brush and a
   * two-series silhouette, the framework's scales/axes/tooltip machinery would be more code
   * than the ~15 lines of arithmetic it replaces, and its per-mark components are what made
   * the earlier scatter slow.
   *
   * Keyboard/AT: the plot is a labelled image, not a control — the rail's number inputs are
   * the accessible path to the same scope fields, and the ✕ is a real button.
   */
  import type { HistBin } from './types';
  import { barScale, type ScaleMode } from './scale';

  let {
    bins = [],
    backdrop = [],
    binWidth,
    min = null,
    max = null,
    /**
     * Whether `max` includes its own bin. Years are inclusive (`yearMax: 2020` means 2020
     * counts); continuous cuts like rating are exclusive. Governs both the drawn selection
     * edge and the value emitted, so callers always speak in scope units.
     */
    maxEdge = 'exclusive',
    color = 'var(--chart-1)',
    height = 46,
    scaleMode = 'count',
    label = 'distribution',
    format = (n: number) => String(n),
    onbrush
  }: {
    bins?: HistBin[];
    backdrop?: HistBin[];
    binWidth: number;
    min?: number | null;
    max?: number | null;
    maxEdge?: 'inclusive' | 'exclusive';
    color?: string;
    height?: number;
    scaleMode?: ScaleMode;
    label?: string;
    format?: (n: number) => string;
    onbrush: (min: number | null, max: number | null) => void;
  } = $props();

  const PAD = 1; // px inset so the outermost bars aren't clipped by the viewport edge
  const EPS = 1e-9;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  let w = $state(0);
  let drag = $state<{ a: number; b: number } | null>(null);
  let hover = $state<HistBin | null>(null);
  let hoverX = $state(0);

  /** Domain comes from the backdrop, so the axis holds still while filtering. */
  const dom = $derived.by(() => {
    const src = backdrop.length ? backdrop : bins;
    if (!src.length) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of src) {
      if (b.v < lo) lo = b.v;
      if (b.v > hi) hi = b.v;
    }
    return { lo, hi: hi + binWidth };
  });

  const plotW = $derived(Math.max(0, w - PAD * 2));
  const span = $derived(dom ? dom.hi - dom.lo : 1);
  const px = (v: number) => (dom ? PAD + ((v - dom.lo) / span) * plotW : 0);
  const val = (x: number) => (dom ? dom.lo + ((x - PAD) / (plotW || 1)) * span : 0);
  const barW = $derived(Math.max(1, (binWidth / span) * plotW - 0.5));

  /** Height mapping for both series — see `scale.ts` for why it must be one scale. */
  const scale = $derived(barScale([backdrop, bins], scaleMode));
  const backTotal = $derived(scale.totals[0]);
  const binTotal = $derived(scale.totals[1]);
  /** A non-empty bin always draws at least 1px so a thin tail stays visible. */
  const barH = (n: number, total: number) =>
    n > 0 ? Math.max(1, scale.frac(n, total) * height) : 0;
  const pctOf = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);

  /** The window to shade: the live drag if any, else the committed scope bounds. */
  const window_ = $derived.by(() => {
    if (!dom) return null;
    if (drag) return { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) };
    if (min == null && max == null) return null;
    const lo = min ?? dom.lo;
    const hi = max == null ? dom.hi : maxEdge === 'inclusive' ? max + binWidth : max;
    return { lo: clamp(lo, dom.lo, dom.hi), hi: clamp(hi, dom.lo, dom.hi) };
  });

  const snap = (v: number, dir: 'lo' | 'hi') => {
    if (!dom) return v;
    const k = (v - dom.lo) / binWidth;
    return dom.lo + (dir === 'lo' ? Math.floor(k + EPS) : Math.ceil(k - EPS)) * binWidth;
  };

  function commit(a: number, b: number) {
    if (!dom) return;
    const lo = clamp(snap(Math.min(a, b), 'lo'), dom.lo, dom.hi);
    const hi = clamp(snap(Math.max(a, b), 'hi'), dom.lo, dom.hi);
    // A click with no drag does nothing. Two tempting alternatives are both worse: clearing
    // would let a stray click while reading a tooltip throw away the range you just set, and
    // selecting the single bin under the cursor is almost never what anyone wants from a
    // quarter-point bucket. Setting is a drag, clearing is the ✕ — neither happens by accident.
    if (hi - lo < binWidth - EPS) return;
    const openLeft = lo <= dom.lo + EPS;
    const openRight = hi >= dom.hi - EPS;
    onbrush(
      openLeft ? null : round(lo),
      openRight ? null : round(maxEdge === 'inclusive' ? hi - binWidth : hi)
    );
  }

  /**
   * Pointer x within the plot. Measured off the `<svg>`'s own box rather than `offsetX`:
   * `offsetX` is relative to the *event target*, which is whichever bar `<rect>` the pointer
   * happens to be over, so it reads near-zero on every bar. (The drag is immune — pointer
   * capture retargets its events to the svg — which is exactly why the bug hides in hover.)
   */
  const localX = (e: PointerEvent) =>
    e.clientX - (e.currentTarget as SVGElement).getBoundingClientRect().left;

  function onPointerDown(e: PointerEvent) {
    if (!dom || e.button !== 0) return;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    const v = val(localX(e));
    drag = { a: v, b: v };
    hover = null;
  }

  function onPointerMove(e: PointerEvent) {
    if (!dom) return;
    const x = localX(e);
    if (drag) {
      drag = { ...drag, b: val(x) };
      return;
    }
    hoverX = x;
    const lo = snap(val(x), 'lo');
    hover = bins.find((b) => Math.abs(b.v - lo) < EPS) ?? { v: lo, n: 0 };
  }

  function onPointerUp() {
    if (!drag) return;
    const { a, b } = drag;
    drag = null;
    commit(a, b);
  }

  /** Stepped outline across the backdrop's bar tops — one polyline, no per-bin nodes. */
  const backPath = $derived.by(() => {
    if (!dom || plotW <= 0 || !backdrop.length) return '';
    const d: string[] = [];
    for (const b of backdrop) {
      const x0 = px(b.v);
      const y = height - barH(b.n, backTotal);
      d.push(`${d.length ? 'L' : 'M'}${x0.toFixed(1)} ${y.toFixed(1)}`, `L${(x0 + barW).toFixed(1)} ${y.toFixed(1)}`);
    }
    return d.join('');
  });

  const active = $derived(min != null || max != null);
  const summary = $derived(
    active
      ? `${label}, showing ${min == null ? 'any' : format(min)} to ${max == null ? 'any' : format(max)}`
      : label
  );
</script>

<div class="mh" bind:clientWidth={w} style:--h="{height}px">
  {#if hover && !drag}
    <!-- The bar is a height on a shared scale; the exact count belongs here. -->
    <span class="tip" style:left="{hoverX}px" style:--edge={hoverX > w / 2 ? '100%' : '0%'}>
      {format(hover.v)}<span class="dim">·</span>{hover.n.toLocaleString()}
      <span class="dim">({pctOf(hover.n, binTotal).toFixed(1)}%)</span>
    </span>
  {/if}

  {#if active}
    <button class="clear" onclick={() => onbrush(null, null)} title="Clear this range">×</button>
  {/if}

  <svg
    role="img"
    aria-label={summary}
    width={w || 1}
    {height}
    class:dragging={!!drag}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={() => (drag = null)}
    onpointerleave={() => (hover = null)}
  >
    {#if dom && plotW > 0}
      <!-- the whole universe, as a shape to compare against -->
      <g class="back">
        {#each backdrop as b (b.v)}
          <rect x={px(b.v)} y={height - barH(b.n, backTotal)} width={barW} height={barH(b.n, backTotal)} />
        {/each}
      </g>

      {#if window_}
        <rect class="shade" x={px(window_.lo)} y="0" width={Math.max(1, px(window_.hi) - px(window_.lo))} {height} />
      {/if}

      <!-- the current scope -->
      <g class="fore" style:fill={color}>
        {#each bins as b (b.v)}
          <rect x={px(b.v)} y={height - barH(b.n, binTotal)} width={barW} height={barH(b.n, binTotal)} />
        {/each}
      </g>

      <!-- The universe's outline, redrawn over the selection: where the scope's share is the
           larger of the two its bars hide the silhouette entirely, and the reference curve is
           the thing you are meant to be comparing against. -->
      {#if backdrop.length && bins.length}
        <path class="backline" d={backPath} />
      {/if}

      {#if window_}
        <g class="edges">
          <line x1={px(window_.lo)} x2={px(window_.lo)} y1="0" y2={height} />
          <line x1={px(window_.hi)} x2={px(window_.hi)} y1="0" y2={height} />
        </g>
      {/if}
    {/if}
  </svg>
</div>

<style>
  .mh {
    position: relative;
    height: var(--h);
    cursor: crosshair;
    touch-action: none;
  }
  svg {
    display: block;
    overflow: visible;
  }
  /* All interaction belongs to the <svg>; the marks must never become the event target. */
  svg g,
  svg rect,
  svg line {
    pointer-events: none;
  }
  svg.dragging {
    cursor: ew-resize;
  }
  /* Tinted from the text colour, not `--border`: the border token is near-invisible on a
     light background, and the silhouette has to be readable in both themes. */
  .back rect {
    fill: color-mix(in oklch, var(--muted-foreground) 30%, transparent);
  }
  /* `.fore rect` takes its fill from the inline series colour. */
  /* Kept faint: once a brush is committed, the *coloured* bars already mark the window —
     the shade and its edges only have to pin the exact bounds, including empty edge bins. */
  .shade {
    fill: color-mix(in oklch, var(--primary) 8%, transparent);
  }
  .edges line {
    stroke: var(--primary);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .backline {
    fill: none;
    stroke: color-mix(in oklch, var(--muted-foreground) 62%, transparent);
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .tip {
    position: absolute;
    bottom: calc(var(--h) + 0.15rem);
    transform: translateX(calc(-1 * var(--edge)));
    z-index: 3;
    white-space: nowrap;
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.05rem 0.3rem;
    pointer-events: none;
    box-shadow: 0 2px 6px oklch(0 0 0 / 0.12);
  }
  .tip .dim {
    color: var(--muted-foreground);
    margin: 0 0.25rem;
  }
  .clear {
    position: absolute;
    top: calc(-1 * 1.25rem);
    right: 0;
    z-index: 2;
    width: 1.1rem;
    height: 1.1rem;
    line-height: 1;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .clear:hover {
    color: var(--primary);
    background: var(--muted);
  }
</style>
