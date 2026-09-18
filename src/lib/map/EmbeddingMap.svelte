<script lang="ts">
  /**
   * The embedding map, WebGL edition: regl-scatterplot draws and drives the cloud (points,
   * pan/zoom, hover and click hit-testing, lasso later); a transparent canvas above it draws
   * what the library deliberately doesn't — anchor labels, the hover/selection rings — in
   * the theme's own ink, positioned through `getScreenPosition()` on every camera change.
   *
   * Replaced the hand-drawn 2-D canvas (`EmbeddingMapCanvas.svelte`, kept for comparison):
   * 36k `arc()` calls per wheel tick was the ceiling, and zoom/pan felt stilted. Here the
   * GPU repaints in ~1ms, so the gesture is the bottleneck, not the drawing.
   *
   * Same contract as before — pure data-in / events-out, no routes, catalog or URL — so the
   * page, the tour, a mini-map and a teaser all sit on the same component.
   */
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import type createScatterplot from 'regl-scatterplot';
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { ViewState } from './view';
  import { buildColouring, radiusFor, type Colouring } from './scales';
  import { readTheme, toHex, type MapTheme } from './palette';
  import { placeLabels, type LabelInput } from './labels';

  let {
    coords,
    facts,
    view,
    anchors = [],
    mode = 'pan',
    keep = null,
    focus = null,
    cameraFixed = false,
    interactive = true,
    frame = true,
    stripOffset = 0,
    onselectionchange,
    onhover,
    ontogglecategory
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    view: ViewState;
    anchors?: number[];
    /** What a plain drag does. Shift+drag lassos in either mode. */
    mode?: 'pan' | 'lasso';
    /** Game ids to keep on the map (a lasso set); null = everything the other filters allow. */
    keep?: number[] | null;
    /** Game ids to frame (zoom to) without hiding anything else; null = the whole map. */
    focus?: number[] | null;
    /**
     * No wheel-zoom or drag-pan: the camera only moves programmatically (`focus`/`keep`).
     * Hover and click still work. The tour sets this so the wheel scrolls the page instead
     * of being swallowed by the map.
     */
    cameraFixed?: boolean;
    /** Hover, click and drag at all. Off, the map is a picture (a tour step that's just
     * there to be looked at). */
    interactive?: boolean;
    /** Draw the border/rounding around the map. */
    frame?: boolean;
    /** Strip only: shift the band up (+) or down (−) in NDC, e.g. to leave room for a caption. */
    stripOffset?: number;
    /**
     * The selection changed: a click toggled one game, or a lasso added its enclosed games.
     * The page owns the list (it's `view.selected`); the map only proposes the next one.
     */
    onselectionchange?: (ids: number[]) => void;
    onhover?: (id: number | null) => void;
    /** A legend swatch was clicked — the page decides what the filter becomes. */
    ontogglecategory?: (code: number) => void;
  } = $props();

  const CURRENT_YEAR = new Date().getFullYear();
  // PLACEHOLDER copy — legend titles.
  const COLOUR_LABEL: Record<ViewState['colour'], string> = {
    weight: 'Weight',
    geek: 'Geek rating',
    rating: 'Average rating',
    year: 'Year',
    upcoming: 'Upcoming',
    category: 'Category'
  };
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  /** regl-scatterplot sizes are diameters in px; sizes are bucketed to whole px so they can
   * ride in the categorical `valueB` slot with a lookup table. */
  const MAX_DIAMETER = 20;
  const MAX_SELECTED_LABELS = 25;
  const SIZE_TABLE = Array.from({ length: MAX_DIAMETER + 1 }, (_, i) => Math.max(i, 1));

  let host: HTMLDivElement;
  let glCanvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let theme: MapTheme | null = $state(null);
  // $state.raw so the effects that push data/theme into the plot re-run once it exists
  // (it's created after a dynamic import, well after the first effect pass).
  let plot = $state.raw<ReturnType<typeof createScatterplot> | null>(null);

  // --- projection → normalised device coords -------------------------------------------
  const uniform = $derived(view.size === 'uniform');
  const strip = $derived(view.projection === 'strip');
  const xs = $derived(view.projection === 'umap' ? coords.umap[0] : coords.pcs[view.x - 1]);
  /** Strip: y is deterministic per-game jitter (hash of id, roughly normal) — vertical
   * position carries nothing, it just lets the density read. */
  const jitterY = $derived.by(() => {
    const n = coords.ids.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = jitter(coords.ids[i]);
    return out;
  });
  const ys = $derived(strip ? jitterY : view.projection === 'pca' ? coords.pcs[view.y - 1] : coords.umap[1]);
  function jitter(id: number): number {
    let h = (id * 2654435761) >>> 0, s = 0;
    for (let k = 0; k < 4; k++) { h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; s += (h & 0xffff) / 0xffff; }
    return (s / 4 - 0.5) * 3.2; // sum of four uniforms ≈ normal; ±1 is ~2.5σ
  }

  /**
   * Data → [-1, 1]. Map: one shared scale on both axes so distances aren't distorted.
   * Strip: x fills the range of the games currently shown (upcoming games can sit far
   * outside the rated data's shape and would squash it), y is a narrow band.
   */
  const ndc = $derived.by(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const shownOnly = strip;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (shownOnly && !(facts.upcoming[i] === 1 ? view.upcoming : facts.usersRated[i] >= view.minRatings)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const nx = new Float32Array(xs.length), ny = new Float32Array(xs.length);
    if (strip) {
      const sx = 1.9 / Math.max(x1 - x0, 1e-9), cx = (x0 + x1) / 2;
      for (let i = 0; i < xs.length; i++) { nx[i] = (xs[i] - cx) * sx; ny[i] = ys[i] * 0.22 + stripOffset; }
    } else {
      const s = 1.9 / Math.max(x1 - x0, y1 - y0, 1e-9);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      for (let i = 0; i < xs.length; i++) { nx[i] = (xs[i] - cx) * s; ny[i] = (ys[i] - cy) * s; }
    }
    return { nx, ny };
  });

  /** The map keeps a square data space; the strip stretches x to the canvas width. */
  $effect(() => {
    if (!plot || width === 0 || height === 0) return;
    plot.set({ aspectRatio: strip ? width / height : 1 });
  });

  const visible = $derived.by(() => {
    const n = coords.ids.length;
    const idx: number[] = [];
    const cats = view.categories ? new Set(view.categories) : null;
    const kept = keep ? new Set(keep) : null;
    for (let i = 0; i < n; i++) {
      const up = facts.upcoming[i] === 1;
      let show = up ? view.upcoming : facts.usersRated[i] >= view.minRatings;
      if (show && cats) show = cats.has(facts.category[i]);
      if (show && kept) show = kept.has(coords.ids[i]);
      if (show && Number.isFinite(xs[i]) && Number.isFinite(ys[i])) idx.push(i);
    }
    return idx;
  });

  const colouring: Colouring | null = $derived(theme ? buildColouring(view.colour, facts, theme, CURRENT_YEAR) : null);

  const sizeBucket = $derived.by(() => {
    const n = coords.ids.length;
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const d = Math.round(2 * radiusFor(facts.usersRated[i], facts.upcoming[i] === 1, uniform));
      b[i] = Math.min(MAX_DIAMETER, Math.max(1, d));
    }
    return b;
  });

  let hovered = $state<number>(-1);
  const selectedIdx = $derived(view.selected.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));
  const anchorIdx = $derived(anchors.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));

  // --- push state into the plot ------------------------------------------------------
  /** Theme-dependent settings. Colours must be hex: the library reads them on the CPU. */
  $effect(() => {
    if (!plot || !theme || !colouring) return;
    plot.set({
      backgroundColor: toHex(theme.background),
      pointColor: colouring.colours.map(toHex),
      pointColorHover: toHex(theme.accent),
      pointColorActive: toHex(theme.accent),
      lassoColor: toHex(theme.accent)
    });
  });

  $effect(() => { plot?.set({ mouseMode: mode === 'lasso' ? 'lasso' : 'panZoom' }); });
  $effect(() => { plot?.set({ cameraIsFixed: cameraFixed }); });

  /**
   * Animation queue. regl can't overlap a transitioned `draw` with a camera transition:
   * a draw started mid-zoom leaves regl's promise unresolved and its `isDrawing` flag
   * stuck, after which every draw is rejected. So draws and zooms run one at a time,
   * the newest request of each kind replacing any still waiting, and each is raced
   * against its own duration so a lost regl promise can never stall the queue. This is
   * what made "scroll back up" fail to undo the zoom in the tour.
   */
  let pendingDraw: (() => Promise<void>) | null = null;
  let pendingZoom: (() => Promise<void>) | null = null;
  let running = false;
  const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  /** Await `p`, but never longer than `ms` — a safety net for a lost regl promise, sized
   * well past the animation so it only fires when something has genuinely gone wrong. */
  const settle = (p: Promise<unknown>, ms: number): Promise<void> => Promise.race([p.catch(() => {}), timeout(ms)]).then(() => {});
  /** regl rejects a draw if it's still busy from the last one; back off briefly and retry. */
  async function drawRetry(run: () => Promise<unknown>, ms: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await Promise.race([run(), timeout(ms)]); return; }
      catch { await timeout(150); }
    }
  }
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (pendingDraw || pendingZoom) {
        // A draw first: a zoom should frame the points where they'll end up.
        const job = pendingDraw ?? pendingZoom;
        if (pendingDraw) pendingDraw = null; else pendingZoom = null;
        await job!();
      }
    } finally { running = false; }
  }
  function enqueueDraw(job: () => Promise<void>) { pendingDraw = job; void pump(); }
  function enqueueZoom(job: () => Promise<void>) { pendingZoom = job; void pump(); }

  /**
   * Positions + encodings. One `draw` per change of projection/axes/colour/size.
   * Positions animate: a projection switch shows each game travelling to its new spot;
   * colour/size-only draws are instant. The very first draw starts everything at the
   * centre so the opening is the cloud unfolding, not a lump already there.
   */
  // Reactive so the filter and framing effects re-run once a fresh draw has landed.
  let drawn = $state(false);
  let lastNdc: typeof ndc | null = null;
  $effect(() => {
    if (!plot || !colouring) return;
    const { nx, ny } = ndc;
    const va = colouring.bucketOf, vb = sizeBucket;
    const p = plot;
    const first = lastNdc === null;
    const moved = ndc !== lastNdc;
    lastNdc = ndc;
    drawn = false;
    const duration = first ? 1400 : 800;
    enqueueDraw(async () => {
      if (first) {
        await drawRetry(() => p.draw({ x: new Float32Array(nx.length), y: new Float32Array(ny.length), valueA: va, valueB: vb }, { preventFilterReset: true }), 1500);
      }
      await drawRetry(
        () => p.draw({ x: nx, y: ny, valueA: va, valueB: vb }, { preventFilterReset: true, transition: moved, transitionDuration: duration }),
        moved ? duration * 2 + 500 : 1500
      );
      drawn = true; applyFilter(); scheduleOverlay();
    });
  });

  function applyFilter() {
    if (!plot || !drawn) return;
    if (visible.length === coords.ids.length) plot.unfilter({ preventEvent: true });
    else plot.filter(visible, { preventEvent: true });
  }
  $effect(() => { void visible; applyFilter(); });

  /**
   * A lasso set arriving usually also shrinks the map (the table opens below it), and regl
   * keeps its camera, so the kept cluster would sit small in the middle. Frame it instead;
   * clearing the set goes back to the whole map. Runs after layout has settled so the zoom
   * targets the new canvas size, not the old one.
   */
  // `focus` frames a set the same way but leaves the rest of the map drawn (the tour uses
  // it to zoom into a neighbourhood). `keep` wins when both are given.
  // Queued behind any draw in flight, so the camera never chases points still moving.
  let lastFrame: number[] | null = null;
  $effect(() => {
    const k = keep ?? focus;
    if (!plot) return;
    const had = lastFrame;
    lastFrame = k;
    const p = plot;
    if (k && k.length) {
      const idx = k.map((id) => coords.index.get(id)).filter((i): i is number => i != null);
      if (idx.length) enqueueZoom(() => settle(p.zoomToPoints(idx, { padding: 0.25, transition: true, transitionDuration: 600 }), 1500));
    } else if (had) {
      // Not `reset()`: that re-creates the camera with no transition (and doesn't take
      // while the camera is fixed). Frame the whole data square the same way we framed
      // the subset, so out mirrors in.
      enqueueZoom(() => settle(p.zoomToArea({ x: -1, y: -1, width: 2, height: 2 }, { transition: true, transitionDuration: 600 }), 1500));
    }
  });


  // --- overlay -----------------------------------------------------------------------
  let raf = 0;
  function scheduleOverlay() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; drawOverlay(); });
  }
  $effect(() => { void hovered; void selectedIdx; void anchorIdx; void width; void height; scheduleOverlay(); });

  let tip = $state<{ x: number; y: number } | null>(null);

  function drawOverlay() {
    if (!overlay || !plot || !theme || width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (overlay.width !== Math.round(width * dpr)) { overlay.width = Math.round(width * dpr); overlay.height = Math.round(height * dpr); }
    const ctx = overlay.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `600 12px ${theme.font}`;
    ctx.textBaseline = 'middle';

    const shown = new Set(visible);
    const r = (i: number) => radiusFor(facts.usersRated[i], facts.upcoming[i] === 1, uniform);

    // Rings first, collecting the labels; then one placement pass so labels avoid each
    // other and the edges (see labels.ts). Anchors are ringed in the foreground ink,
    // selected games in the accent; labels for selections only while the set is readable.
    const want: LabelInput[] = [];
    for (const i of anchorIdx) {
      if (!shown.has(i)) continue;
      const p = plot.getScreenPosition(i);
      if (!p) continue;
      dot(ctx, p[0], p[1], r(i) + 1.5, theme.accent, theme.background);
      want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[i]), gap: r(i) + 4 });
    }
    const labelSelected = selectedIdx.length <= MAX_SELECTED_LABELS;
    for (const i of selectedIdx) {
      if (!shown.has(i)) continue;
      const p = plot.getScreenPosition(i);
      if (!p) continue;
      ring(ctx, p[0], p[1], r(i) + 3, theme.accent, theme.background, 2);
      if (labelSelected && !anchorIdx.includes(i)) want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[i]), gap: r(i) + 5 });
    }
    const placed = placeLabels(
      want,
      { measure: (s) => ctx.measureText(s).width, lineHeight: 14, maxWidth: 150, padX: 4, padY: 2 },
      { x: 0, y: 0, width, height }
    );
    for (const p of placed) labelBox(ctx, p.lines, p.bx, p.by, p.bw, p.bh, 14, 4, 2, theme.foreground, theme.background);
    if (hovered >= 0 && shown.has(hovered)) {
      const p = plot.getScreenPosition(hovered);
      if (p) ring(ctx, p[0], p[1], r(hovered) + 3, theme.accent, theme.background, 2);
    }
    if (hovered >= 0) {
      const p = plot.getScreenPosition(hovered);
      tip = p ? { x: p[0], y: p[1] } : null;
    } else tip = null;
  }

  /** A filled accent point with a background halo — how an anchor is drawn on top of the cloud. */
  function dot(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, fill: string, halo: string) {
    ctx.beginPath(); ctx.arc(x, y, rad + 1.5, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }
  function ring(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, stroke: string, halo: string, w = 1.5) {
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.lineWidth = w + 2; ctx.strokeStyle = halo; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
  }
  /** Wrapped label in the foreground ink on a translucent background chip, so it stays
   * legible over dots without hiding them entirely. */
  function labelBox(ctx: CanvasRenderingContext2D, lines: string[], bx: number, by: number, bw: number, bh: number, lh: number, padX: number, padY: number, ink: string, halo: string) {
    ctx.globalAlpha = 0.82; ctx.fillStyle = halo;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textBaseline = 'middle';
    lines.forEach((t, k) => ctx.fillText(t, bx + padX, by + padY + lh * (k + 0.5)));
  }

  onMount(() => {
    theme = readTheme();
    let disposed = false;
    let cleanup: (() => void) | null = null;
    // Browser-only library (WebGL, window): imported here rather than at module level so
    // SSR never evaluates it.
    import('regl-scatterplot').then(({ default: createScatterplot }) => {
      if (disposed) return;
      cleanup = init(createScatterplot);
    });
    return () => { disposed = true; cleanup?.(); };
  });

  function init(createScatterplot: typeof import('regl-scatterplot').default) {
    // `pointSizeMouseDetection` is a real option (see `computePointSizeMouseDetection` in
    // the library) that its typings omit.
    plot = createScatterplot({
      pointSizeMouseDetection: 4,
      canvas: glCanvas,
      width: 'auto',
      height: 'auto',
      pointSize: SIZE_TABLE,
      // With a size *table*, regl's auto hit radius is the table's max (20px + 4): a 2px
      // dot 24px from the cursor would be "hovered" and the ring would jump to it. Use a
      // small fixed radius; regl still picks the nearest point within it.
      sizeBy: 'valueB',
      colorBy: 'valueA',
      opacity: 0.75,
      pointOutlineWidth: 0,
      deselectOnDblClick: false,
      deselectOnEscape: true,
      lassoOnLongPress: true,
      // Sample the pointer every frame and every pixel — the defaults (10ms / 3px) drew a
      // visibly jagged polygon.
      lassoMinDelay: 0,
      lassoMinDist: 1,
      lassoLineWidth: 1.5
    } as Parameters<typeof createScatterplot>[0]);
    // Dev-only handle for poking at the plot from the console / headless checks.
    if (dev) (window as unknown as { __map: unknown }).__map = plot;
    plot.subscribe('pointOver', (i) => { hovered = i; onhover?.(coords.ids[i]); });
    plot.subscribe('pointOut', () => { hovered = -1; onhover?.(null); });
    // regl fires the same `select` for a click (one point) and a lasso (many). A click
    // toggles that game in the selection; a lasso adds its games. The highlight is ours (the
    // overlay rings), so regl's own selection is dropped straight after — otherwise its
    // tint would linger and its next click would replace rather than toggle.
    plot.subscribe('select', ({ points }) => {
      const cur = view.selected;
      let next: number[];
      if (points.length === 1) {
        const id = coords.ids[points[0]];
        next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      } else {
        const add = points.map((i) => coords.ids[i]).filter((id) => !cur.includes(id));
        next = [...cur, ...add];
      }
      plot?.deselect({ preventEvent: true });
      onselectionchange?.(next);
    });
    // Background clicks and Escape fire `deselect`; the page's Clear owns emptying the list.
    plot.subscribe('view', scheduleOverlay);
    plot.subscribe('draw', scheduleOverlay);
    const reset = () => plot?.reset();
    glCanvas.addEventListener('dblclick', reset);

    // Size is regl's job: with width/height 'auto' it observes its own canvas and keeps the
    // camera, aspect ratio and pointer mapping in step. Setting explicit numbers here would
    // switch it out of auto mode and freeze that — which is what made clicks land beside the
    // cursor once the selection table opened. This observer only sizes the overlay.
    const ro = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
    });
    ro.observe(host);
    const mo = new MutationObserver(() => { theme = readTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      ro.disconnect(); mo.disconnect();
      glCanvas.removeEventListener('dblclick', reset);
      if (raf) cancelAnimationFrame(raf);
      plot?.destroy(); plot = null;
    };
  }
</script>

<div class="host" class:lasso={mode === 'lasso'} class:fixed-camera={cameraFixed} class:inert={!interactive} class:frameless={!frame} bind:this={host}>
  <canvas bind:this={glCanvas} class="gl"></canvas>
  <canvas bind:this={overlay} class="overlay" style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
  {#if colouring}
    <div class="legend">
      <div class="legend-title">{COLOUR_LABEL[view.colour]}</div>
      {#if colouring.domain}
        <div class="bar" style:background="linear-gradient(to right, {colouring.colours.slice(1).join(', ')})"></div>
        <div class="ends">
          <span>{fmt(colouring.domain[0])}{colouring.clamped ? '−' : ''}</span>
          {#if colouring.mid != null}
            {@const [lo, hi] = colouring.domain}
            <span class="mid" style:left="{((colouring.mid - lo) / (hi - lo)) * 100}%">{fmt(colouring.mid)}</span>
          {/if}
          <span>{fmt(colouring.domain[1])}{colouring.clamped ? '+' : ''}</span>
        </div>
        <div class="swatch-row"><i style:background={colouring.colours[0]}></i> no value</div>
      {:else}
        {#each colouring.legend as { label, bucket } (bucket)}
          {#if view.colour === 'category'}
            <button
              type="button"
              class="swatch-row"
              class:off={view.categories != null && !view.categories.includes(bucket)}
              onclick={() => ontogglecategory?.(bucket)}
              title="Click to keep only this category; click again to release"
            ><i style:background={colouring.colours[bucket]}></i> {label}</button>
          {:else}
            <div class="swatch-row"><i style:background={colouring.colours[bucket]}></i> {label}</div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
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
  .gl {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }
  .host.lasso .gl { cursor: cell; }
  .host.fixed-camera .gl { cursor: default; }
  .host.inert .gl { pointer-events: none; }
  .host.frameless { border: 0; border-radius: 0; }
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
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
  .legend {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    pointer-events: auto;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in oklch, var(--card) 88%, transparent);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    line-height: 1.4;
    min-width: 9rem;
  }
  .legend-title { color: var(--foreground); font-weight: 600; margin-bottom: 0.25rem; }
  .bar { height: 0.55rem; border-radius: 2px; }
  .ends { position: relative; display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
  .ends .mid { position: absolute; transform: translateX(-50%); color: var(--foreground); }
  .swatch-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.15rem; }
  button.swatch-row {
    border: 0; background: none; padding: 0; color: inherit; font: inherit; cursor: pointer;
    width: 100%; text-align: left;
  }
  button.swatch-row:hover { color: var(--foreground); }
  button.swatch-row.off { opacity: 0.35; }
  .swatch-row i { width: 0.65rem; height: 0.65rem; border-radius: 50%; flex: none; }
  .tip .name { font-weight: 600; }
  .tip .meta { color: var(--muted-foreground); }
</style>
