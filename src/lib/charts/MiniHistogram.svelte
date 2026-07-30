<script lang="ts">
  /**
   * A small histogram you filter by dragging across it.
   *
   * Two series share the frame: `backdrop` (the whole universe) as a muted silhouette and
   * `bins` (the current scope) as solid bars. Each is scaled to its *own* max — the point of
   * the pair is to compare **shape** ("my slice skews heavier than the catalog"), while
   * magnitude is carried by the count text next to the chart. A shared scale would flatten a
   * 2%-of-catalog selection into an unreadable sliver.
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

  const peak = (s: HistBin[]) => Math.max(1, ...s.map((b) => b.n));
  const backPeak = $derived(peak(backdrop));
  const binPeak = $derived(peak(bins));
  /** A non-empty bin always draws at least 1px so a thin tail stays visible. */
  const barH = (n: number, max: number) => (n > 0 ? Math.max(1, (n / max) * height) : 0);

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
    if (hi - lo < binWidth - EPS) return onbrush(null, null); // a tap, not a range → clear
    const openLeft = lo <= dom.lo + EPS;
    const openRight = hi >= dom.hi - EPS;
    onbrush(
      openLeft ? null : round(lo),
      openRight ? null : round(maxEdge === 'inclusive' ? hi - binWidth : hi)
    );
  }

  function onPointerDown(e: PointerEvent) {
    if (!dom || e.button !== 0) return;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    const v = val(e.offsetX);
    drag = { a: v, b: v };
    hover = null;
  }

  function onPointerMove(e: PointerEvent) {
    if (!dom) return;
    if (drag) {
      drag = { ...drag, b: val(e.offsetX) };
      return;
    }
    const v = val(e.offsetX);
    hoverX = e.offsetX;
    const lo = snap(v, 'lo');
    hover = bins.find((b) => Math.abs(b.v - lo) < EPS) ?? { v: lo, n: 0 };
  }

  function onPointerUp() {
    if (!drag) return;
    const { a, b } = drag;
    drag = null;
    commit(a, b);
  }

  const active = $derived(min != null || max != null);
  const summary = $derived(
    active
      ? `${label}, showing ${min == null ? 'any' : format(min)} to ${max == null ? 'any' : format(max)}`
      : label
  );
</script>

<div class="mh" bind:clientWidth={w} style:--h="{height}px">
  {#if hover && !drag}
    <span class="tip" style:left="{hoverX}px" style:--edge={hoverX > w / 2 ? '100%' : '0%'}>
      {format(hover.v)}<span class="dim">·</span>{hover.n.toLocaleString()}
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
    onpointerleave={() => (hover = null)}
  >
    {#if dom && plotW > 0}
      <!-- the whole universe, as a shape to compare against -->
      <g class="back">
        {#each backdrop as b (b.v)}
          <rect x={px(b.v)} y={height - barH(b.n, backPeak)} width={barW} height={barH(b.n, backPeak)} />
        {/each}
      </g>

      {#if window_}
        <rect class="shade" x={px(window_.lo)} y="0" width={Math.max(1, px(window_.hi) - px(window_.lo))} {height} />
      {/if}

      <!-- the current scope -->
      <g class="fore" style:fill={color}>
        {#each bins as b (b.v)}
          <rect x={px(b.v)} y={height - barH(b.n, binPeak)} width={barW} height={barH(b.n, binPeak)} />
        {/each}
      </g>

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
