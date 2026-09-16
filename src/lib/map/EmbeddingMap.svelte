<script lang="ts">
  /**
   * The embedding map: every game as a dot on a 2-D projection, drawn on a canvas.
   *
   * Raw canvas rather than LayerChart, deliberately: ~36k points under pan/zoom is past
   * what SVG holds up under, and the whole point of the page is the cloud. The chart
   * pieces LayerChart would give us (axes, ticks) are meaningless here — PCA units and
   * UMAP units aren't quantities anyone reads — so nothing is lost.
   *
   * Pure data-in / events-out: it knows nothing about routes, the catalog, or the URL.
   * That is what lets the same component later drive the guided tour (a sequence of
   * `view`s), a game-detail mini-map (fixed `selected`, no controls) and a landing teaser.
   */
  import { onMount } from 'svelte';
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { ViewState } from './view';
  import { buildColouring, radiusFor, type Colouring } from './scales';
  import { buildIndex, nearest, type PointIndex } from './quadtree';
  import { readTheme, type MapTheme } from './palette';

  let {
    coords,
    facts,
    view,
    anchors = [],
    onselect,
    onhover
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    view: ViewState;
    anchors?: number[];
    onselect?: (id: number | null) => void;
    onhover?: (id: number | null) => void;
  } = $props();

  const PAD = 24; // px, data extent → canvas
  const HIT_PX = 8; // hover search radius in screen px
  const MAX_DPR = 2; // enough for crisp dots; DPR 3 phones pay triple the fill for nothing
  const CURRENT_YEAR = new Date().getFullYear();

  let host: HTMLDivElement;
  // Two stacked canvases. The cloud (36k dots) is expensive and only changes on
  // data/zoom/colour; the overlay (anchors, hover ring, selection) is cheap and changes on
  // every pointer move. Splitting them means hovering never repaints the cloud.
  let canvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);

  // --- projection → data columns -----------------------------------------------------
  const xs = $derived(view.projection === 'pca' ? coords.pcs[view.x - 1] : coords.umap[0]);
  const ys = $derived(view.projection === 'pca' ? coords.pcs[view.y - 1] : coords.umap[1]);

  const visible = $derived.by(() => {
    const n = coords.ids.length;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const up = facts.upcoming[i] === 1;
      mask[i] = up ? (view.upcoming ? 1 : 0) : facts.usersRated[i] >= view.minRatings ? 1 : 0;
    }
    return mask;
  });

  /** Data extent over *all* points, so the frame doesn't jump when the filter changes. */
  const extent = $derived.by(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const px = (x1 - x0) * 0.04 || 1, py = (y1 - y0) * 0.04 || 1;
    return { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py };
  });

  /** Base scale: data → canvas px, aspect-preserving, centred. Zoom multiplies this. */
  const base = $derived.by(() => {
    const w = Math.max(width - 2 * PAD, 1), h = Math.max(height - 2 * PAD, 1);
    const s = Math.min(w / (extent.x1 - extent.x0), h / (extent.y1 - extent.y0));
    const ox = PAD + (w - s * (extent.x1 - extent.x0)) / 2;
    const oy = PAD + (h - s * (extent.y1 - extent.y0)) / 2;
    return { s, ox, oy };
  });

  // Zoom/pan is gesture state, not view state — it resets when the projection changes.
  let k = $state(1), tx = $state(0), ty = $state(0);
  $effect(() => { void view.projection; void view.x; void view.y; k = 1; tx = 0; ty = 0; });

  function sx(x: number) { return tx + k * (base.ox + base.s * (x - extent.x0)); }
  function sy(y: number) { return ty + k * (base.oy + base.s * (extent.y1 - y)); } // y up
  function dx(px: number) { return extent.x0 + ((px - tx) / k - base.ox) / base.s; }
  function dy(py: number) { return extent.y1 - ((py - ty) / k - base.oy) / base.s; }

  // --- colour & hit index ------------------------------------------------------------
  let theme: MapTheme | null = $state(null);
  const colouring: Colouring | null = $derived(theme ? buildColouring(view.colour, facts, theme, CURRENT_YEAR) : null);

  /** Point indices grouped by colour bucket, so each bucket is one fillStyle set. */
  const drawOrder = $derived.by(() => {
    if (!colouring) return [] as number[][];
    const groups: number[][] = colouring.colours.map(() => []);
    for (let i = 0; i < visible.length; i++) if (visible[i]) groups[colouring.bucketOf[i]].push(i);
    return groups;
  });

  const index: PointIndex = $derived(buildIndex(xs, ys, visible));

  let hovered = $state<number>(-1); // point index
  const selectedIdx = $derived(view.selected != null ? (coords.index.get(view.selected) ?? -1) : -1);
  const anchorIdx = $derived(anchors.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));

  // --- drawing -----------------------------------------------------------------------
  /*
   * Three kinds of work, cheapest first:
   *   'overlay' — clear + redraw rings/labels (every pointer move)
   *   'view'    — zoom/pan: a *fast* repaint (DPR 1, opaque, still round) so dots keep
   *               their size while the gesture runs, then the full repaint once it pauses.
   *               Scaling a cached bitmap instead was tried and felt wrong: dots grew with
   *               the zoom and snapped back on settle.
   *   'cloud'   — full-quality repaint of 36k dots.
   */
  let raf = 0;
  let dirtyCloud = false, dirtyView = false, dirtyOverlay = false;
  let settleTimer = 0;
  const SETTLE_MS = 140;
  function schedule(layer: 'cloud' | 'view' | 'overlay') {
    if (layer === 'cloud') dirtyCloud = true;
    else if (layer === 'view') {
      dirtyView = true;
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => schedule('cloud'), SETTLE_MS);
    } else dirtyOverlay = true;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (dirtyCloud) drawCloud(false);
      else if (dirtyView) drawCloud(true);
      if (dirtyCloud || dirtyView || dirtyOverlay) drawOverlay();
      dirtyCloud = dirtyView = dirtyOverlay = false;
    });
  }

  /** Size a canvas to the host at the capped DPR; returns a context in CSS px units. */
  function context(c: HTMLCanvasElement, dprCap = MAX_DPR): CanvasRenderingContext2D {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    if (c.width !== Math.round(width * dpr)) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawCloud(fast: boolean) {
    if (!canvas || !theme || !colouring || width === 0) return;
    const ctx = context(canvas, fast ? 1 : MAX_DPR);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    // Established games: filled, translucent so density reads. Upcoming: hollow rings on
    // top, in the same bucket colour — shape carries "upcoming", colour carries the encoding.
    const TAU = Math.PI * 2;
    ctx.lineWidth = 1;
    for (let b = 0; b < drawOrder.length; b++) {
      const idx = drawOrder[b];
      if (idx.length === 0) continue;
      ctx.fillStyle = colouring.colours[b];
      ctx.strokeStyle = colouring.colours[b];
      // Fast pass keeps the dots round (squares read as a different chart) and saves its
      // time on DPR 1 and opaque fills — alpha compositing is the pricier half.
      ctx.globalAlpha = fast ? 1 : 0.65;
      ctx.beginPath();
      for (const i of idx) {
        if (facts.upcoming[i]) continue;
        const r = radiusFor(facts.usersRated[i], false);
        ctx.moveTo(sx(xs[i]) + r, sy(ys[i]));
        ctx.arc(sx(xs[i]), sy(ys[i]), r, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (const i of idx) {
        if (!facts.upcoming[i]) continue;
        const r = radiusFor(0, true);
        ctx.moveTo(sx(xs[i]) + r, sy(ys[i]));
        ctx.arc(sx(xs[i]), sy(ys[i]), r, 0, TAU);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    if (!overlay || !theme || width === 0) return;
    const ctx = context(overlay);
    ctx.clearRect(0, 0, width, height);

    // Anchors: a ring in the foreground ink plus a label — the map's signposts.
    ctx.font = `600 12px ${theme.font}`;
    ctx.textBaseline = 'middle';
    for (const i of anchorIdx) {
      if (!visible[i]) continue;
      ring(ctx, sx(xs[i]), sy(ys[i]), radiusFor(facts.usersRated[i], facts.upcoming[i] === 1) + 2, theme.foreground, theme.background);
      label(ctx, facts.name(coords.ids[i]), sx(xs[i]), sy(ys[i]), radiusFor(facts.usersRated[i], facts.upcoming[i] === 1), theme.foreground, theme.background);
    }
    // Hovered then selected on top, in the accent.
    for (const i of [hovered, selectedIdx]) {
      if (i < 0 || !visible[i]) continue;
      const r = radiusFor(facts.usersRated[i], facts.upcoming[i] === 1);
      ring(ctx, sx(xs[i]), sy(ys[i]), r + 3, theme.accent, theme.background, 2);
      if (i === selectedIdx) label(ctx, facts.name(coords.ids[i]), sx(xs[i]), sy(ys[i]), r + 3, theme.foreground, theme.background);
    }
  }

  function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stroke: string, halo: string, w = 1.5) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = w + 2; ctx.strokeStyle = halo; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
  }
  /** Text in the foreground ink with a background halo so it stays legible over dots. */
  function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, r: number, ink: string, halo: string) {
    const lx = x + r + 5;
    ctx.lineWidth = 3; ctx.strokeStyle = halo; ctx.lineJoin = 'round';
    ctx.strokeText(text, lx, y);
    ctx.fillStyle = ink; ctx.fillText(text, lx, y);
  }

  $effect(() => { void drawOrder; void width; void height; schedule('cloud'); });
  $effect(() => { void k; void tx; void ty; schedule('view'); });
  $effect(() => { void hovered; void selectedIdx; void anchorIdx; schedule('overlay'); });

  // --- interaction -------------------------------------------------------------------
  let pointers = new Map<number, { x: number; y: number }>();
  let dragging = false, moved = 0, lastX = 0, lastY = 0, pinchDist = 0;

  function local(e: PointerEvent | MouseEvent) {
    const r = overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function zoomAt(px: number, py: number, f: number) {
    const nk = Math.min(Math.max(k * f, 1), 64);
    f = nk / k;
    tx = px - (px - tx) * f; ty = py - (py - ty) * f; k = nk;
  }
  function hitAt(px: number, py: number): number {
    return nearest(index, dx(px), dy(py), HIT_PX / (k * base.s));
  }

  function onpointerdown(e: PointerEvent) {
    overlay.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    dragging = true; moved = 0; lastX = p.x; lastY = p.y;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  }
  function onpointermove(e: PointerEvent) {
    const p = local(e);
    if (dragging && pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
        pinchDist = d; moved += 10;
        return;
      }
      tx += p.x - lastX; ty += p.y - lastY; moved += Math.abs(p.x - lastX) + Math.abs(p.y - lastY);
      lastX = p.x; lastY = p.y;
      return;
    }
    if (e.pointerType === 'mouse') setHover(hitAt(p.x, p.y), p);
  }
  function onpointerup(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) dragging = false;
    if (moved < 4) {
      const p = local(e);
      const i = hitAt(p.x, p.y);
      onselect?.(i >= 0 ? coords.ids[i] : null);
    }
  }
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  }
  function ondblclick() { k = 1; tx = 0; ty = 0; }
  function onpointerleave() { setHover(-1); }

  let tip = $state<{ x: number; y: number } | null>(null);
  function setHover(i: number, p?: { x: number; y: number }) {
    if (i !== hovered) { hovered = i; onhover?.(i >= 0 ? coords.ids[i] : null); }
    tip = i >= 0 && p ? p : null;
  }

  onMount(() => {
    theme = readTheme();
    const ro = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
    });
    ro.observe(host);
    // Re-read tokens when the theme class flips.
    const mo = new MutationObserver(() => { theme = readTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); mo.disconnect(); if (raf) cancelAnimationFrame(raf); clearTimeout(settleTimer); };
  });
</script>

<div class="host" bind:this={host}>
  <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
  <canvas
    bind:this={overlay}
    class="overlay"
    style:width="{width}px"
    style:height="{height}px"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onpointerleave}
    {onwheel}
    {ondblclick}
    aria-label="Map of games by embedding coordinates"
    role="img"
  ></canvas>
  {#if tip && hovered >= 0}
    {@const id = coords.ids[hovered]}
    <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px">
      <div class="name">{facts.name(id)}</div>
      <div class="meta">
        {facts.year[hovered] || '—'}
        · {facts.weight[hovered] ? facts.weight[hovered].toFixed(2) : '—'} weight
        · {facts.usersRated[hovered].toLocaleString()} ratings
      </div>
    </div>
  {/if}
</div>

<style>
  .host {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.5rem);
    background: var(--background);
  }
  canvas {
    display: block;
    touch-action: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    cursor: crosshair;
  }
  .tip {
    position: absolute;
    pointer-events: none;
    max-width: 18rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--card);
    color: var(--foreground);
    box-shadow: 0 2px 8px oklch(0 0 0 / 0.12);
    font-size: 0.8125rem;
    line-height: 1.3;
  }
  .tip .name { font-weight: 600; }
  .tip .meta { color: var(--muted-foreground); }
</style>
