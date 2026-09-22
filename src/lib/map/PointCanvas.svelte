<script lang="ts">
  /**
   * The WebGL substrate every point view shares: one regl-scatterplot (points, camera,
   * hit-testing, lasso), a transparent canvas above it for whatever the library won't draw
   * (rings, labels, edges) in the theme's own ink, and the plumbing that makes the two
   * behave — a draw/zoom queue, filtering before transitions, framing, theme and resize
   * observers. It draws what its current `Driver` says (see `surface.ts`) and nothing
   * else: no projections, colourings or games here. Layers mounted inside provide the
   * driver through context; swapping the layer animates the same points to the new
   * arrangement.
   *
   * regl-scatterplot rather than a hand-drawn canvas: 36k `arc()` calls per wheel tick was
   * the ceiling of the 2-D version; the GPU repaints in ~1ms.
   */
  import { onMount, untrack, type Snippet } from 'svelte';
  import { dev } from '$app/environment';
  import type createScatterplot from 'regl-scatterplot';
  import { readTheme, toHex, type MapTheme } from './palette';
  import { provideSurface, MAX_DIAMETER, type Driver, type Surface, type CanvasApi, type ExportOptions } from './surface';

  let {
    mode = 'pan',
    cameraFixed = false,
    interactive = true,
    frame = true,
    lasso = true,
    api = $bindable(null),
    children
  }: {
    /** What a plain drag does. Shift+drag lassos in either mode. */
    mode?: 'pan' | 'lasso';
    /**
     * No wheel-zoom or drag-pan: the camera only moves programmatically (`focus`). Hover
     * and click still work. The tour sets this so the wheel scrolls the page instead of
     * being swallowed by the canvas.
     */
    cameraFixed?: boolean;
    /** Hover, click and drag at all. Off, the view is a picture. */
    interactive?: boolean;
    /** Draw the border/rounding around the canvas. */
    frame?: boolean;
    /**
     * Lasso selection at all (shift+drag, long press). Off, a click is a click within a few
     * px of movement — regl's lasso sampling step doubles as its click threshold, and the
     * 1px step a smooth lasso needs makes clicks nearly impossible to land.
     */
    lasso?: boolean;
    /** Bound by the page for export. */
    api?: CanvasApi | null;
    children?: Snippet;
  } = $props();

  const SIZE_TABLE = Array.from({ length: MAX_DIAMETER + 1 }, (_, i) => Math.max(i, 1));

  let host: HTMLDivElement;
  let glCanvas: HTMLCanvasElement;
  let overlay: HTMLCanvasElement;
  let plot = $state<ReturnType<typeof createScatterplot> | null>(null);
  let theme = $state<MapTheme | null>(null);
  let width = $state(0);
  let height = $state(0);
  let hovered = $state(-1);
  let dragging = false;

  // --- the driver ----------------------------------------------------------------------
  // One layer drives at a time; the last to call `drive` wins, and a layer releasing a
  // driver that has already been replaced is a no-op (a swap mounts the new before the
  // old unmounts).
  let driver = $state.raw<Driver | null>(null); // raw: the driver is a getters object, not data to proxy
  const surface: Surface = {
    drive: (d) => { driver = d; },
    release: (d) => { if (driver === d) driver = null; },
    get hovered() { return hovered; },
    get theme() { return theme; },
    get width() { return width; },
    get height() { return height; },
    repaint: () => scheduleOverlay()
  };
  provideSurface(surface);

  // --- push state into the plot --------------------------------------------------------
  /** Theme-dependent settings. Colours must be hex: the library reads them on the CPU. */
  $effect(() => {
    if (!plot || !theme || !driver) return;
    plot.set({
      backgroundColor: toHex(theme.background),
      pointColor: driver.palette.map(toHex),
      pointColorHover: toHex(theme.accent),
      pointColorActive: toHex(theme.accent),
      lassoColor: toHex(theme.accent),
      opacity: driver.opacity ?? 0.5,
      // An array opacity is indexed by the colour bucket, so it has to be told to read that
      // channel; a scalar is global and must NOT, or regl quantises it against the array
      // length and every point lands on the same alpha step.
      opacityBy: Array.isArray(driver.opacity) ? 'valueZ' : undefined
    });
  });
  $effect(() => { plot?.set({ mouseMode: mode === 'lasso' ? 'lasso' : 'panZoom' }); });
  $effect(() => { plot?.set({ cameraIsFixed: cameraFixed }); });
  /** A square data space by default; a driver may stretch it to the canvas width. */
  $effect(() => {
    if (!plot || width === 0 || height === 0) return;
    plot.set({ aspectRatio: driver?.stretch ? width / height : 1 });
  });

  /**
   * Animation queue. regl can't overlap a transitioned `draw` with a camera transition:
   * a draw started mid-zoom leaves regl's promise unresolved and its `isDrawing` flag
   * stuck, after which every draw is rejected. So draws and zooms run one at a time,
   * the newest request of each kind replacing any still waiting, and each is raced
   * against its own duration so a lost regl promise can never stall the queue.
   */
  let pendingDraw: (() => Promise<void>) | null = null;
  let pendingZoom: (() => Promise<void>) | null = null;
  let running = false;
  const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const settle = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), timeout(ms)]).then(() => {});
  /** A draw regl rejects (it was mid-transition) is retried a few times before giving up. */
  async function drawRetry(run: () => Promise<unknown>, ms: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await Promise.race([run(), timeout(ms)]); return; } catch { await timeout(150); }
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
   * Positions + encodings. Positions animate (a projection switch, or a layer swap, shows
   * each point travelling to its new spot); colour/size-only draws are instant. The very
   * first draw starts everything at the centre so the opening is the cloud unfolding.
   */
  /**
   * Draw order.
   *
   * regl draws points in array order and every dot is semi-transparent, so the points handed
   * over last end up on top. With a scope lit, that meant a great many *context* dots drew
   * over the lit set — the highlight sitting behind its own backdrop. Fading the context
   * helped but could not fix it: no alpha makes a dot that is drawn later stop covering the
   * one underneath.
   *
   * So the points are permuted before they go to regl — context first, lit last — and this
   * is the ONLY place that knows. `order[k]` is the layer index drawn k-th; `slot[i]` is
   * where layer index `i` ended up. Everything crossing the boundary (positions, encodings,
   * the filter, `screen(i)`, hover and selection events) is mapped through one of the two,
   * so a layer keeps talking in its own stable indices and never learns this happened.
   *
   * Identity when nothing is dimmed, which is the resting map — no permutation, no cost.
   */
  let order: Int32Array | null = null;
  let slot: Int32Array | null = null;
  /** Layer index -> the index regl knows it by. */
  const toSlot = (i: number) => (slot && i >= 0 ? slot[i] : i);
  /** regl index -> the layer's index. */
  const toLayer = (k: number) => (order && k >= 0 ? order[k] : k);

  /**
   * Build the permutation from the driver's per-point alpha, which is what distinguishes
   * context from lit (see `withDimmed`). Stable within each group, so the relative order of
   * the landscape — and of the lit set — is unchanged; only the two groups move apart.
   */
  function buildOrder(d: Driver): void {
    const alpha = d.opacity;
    if (!Array.isArray(alpha)) { order = null; slot = null; return; }
    // The lit half of the palette comes first, so a bucket in the back half is context.
    const half = alpha.length / 2;
    const n = d.colour.length;
    const o = new Int32Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) if (d.colour[i] >= half) o[k++] = i; // context, drawn under
    for (let i = 0; i < n; i++) if (d.colour[i] < half) o[k++] = i;  // lit, drawn on top
    const sl = new Int32Array(n);
    for (let j = 0; j < n; j++) sl[o[j]] = j;
    order = o;
    slot = sl;
  }

  /** Reorder a per-point array into draw order. */
  function permute<T extends Float32Array | Uint8Array>(src: T): T {
    if (!order) return src;
    const out = new (src.constructor as new (n: number) => T)(src.length);
    for (let k = 0; k < order.length; k++) out[k] = src[order[k]];
    return out;
  }

  let drawn = $state(false);
  let lastX: Float32Array | null = null;
  /** Bumped to force a positional draw when the positions themselves didn't change. */
  let redrawTick = $state(0);
  /** What regl last drew. Hidden points keep these spots (see below). */
  let shownX: Float32Array | null = null, shownY: Float32Array | null = null;
  $effect(() => {
    const d = driver;
    if (!plot || !d) return;
    const { colour, size } = d;
    let { x, y } = d;
    const p = plot;
    void redrawTick;
    const first = lastX === null;
    const moved = x !== lastX;
    lastX = x;
    drawn = false;
    const duration = first ? 1400 : 800;
    const visible = untrack(() => d.visible);
    // A hidden point stays where it was last drawn, so when a later layer shows it again
    // it travels from there rather than from wherever this layer parked it. That's what
    // keeps map → network → map a flight of the nodes only.
    if (shownX && shownY && visible.length < x.length) {
      const mx = shownX.slice(), my = shownY.slice();
      for (const i of visible) { mx[i] = x[i]; my[i] = y[i]; }
      x = mx; y = my;
    }
    // `shownX`/`shownY` stay in LAYER order — they are compared against the driver's own
    // arrays next time round. The permutation is applied only on the way into regl.
    shownX = x; shownY = y;
    // Rebuild before drawing: the draw, the filter and every event mapping must agree on
    // one permutation, and the encodings that define it are the ones being drawn now.
    buildOrder(d);
    const px = permute(x), py = permute(y);
    const pc = permute(colour), ps = permute(size);
    enqueueDraw(async () => {
      if (first) {
        await drawRetry(() => p.draw({ x: new Float32Array(px.length), y: new Float32Array(py.length), valueA: pc, valueB: ps }, { preventFilterReset: true }), 1500);
      }
      // Filter before the points move, so hidden points never appear mid-transition and
      // then blink out once it lands. Lines go too (they'd join the old spots); inside
      // the queue, because an annotation draw overlapping a transition wedges regl.
      setFilter(visible, px.length);
      if (linesShown !== null && moved) { linesShown = null; await settle(p.drawAnnotations([]), 300); }
      await drawRetry(
        () => p.draw({ x: px, y: py, valueA: pc, valueB: ps }, { preventFilterReset: true, transition: moved, transitionDuration: duration }),
        moved ? duration * 2 + 500 : 1500
      );
      drawn = true; applyFilter(); applyLines(); scheduleOverlay();
    });
  });

  /** Driver lines → regl annotations, once the points are in place; cleared for a flight. */
  let linesShown: unknown = null;
  function applyLines() {
    if (!plot) return;
    const lines = drawn ? (driver?.lines ?? []) : [];
    const key = drawn ? driver?.lines ?? null : null;
    if (key === linesShown) return;
    linesShown = key;
    void plot.drawAnnotations(lines.map((l) => ({ vertices: l.points, lineColor: l.color, lineWidth: l.width })));
  }
  $effect(() => { void driver?.lines; void drawn; applyLines(); });

  /** `v` is in layer indices; regl only knows draw slots. */
  function setFilter(v: number[], n: number) {
    if (!plot) return;
    if (v.length === n) plot.unfilter({ preventEvent: true });
    else plot.filter(slot ? v.map(toSlot) : v, { preventEvent: true });
  }
  function applyFilter() {
    if (drawn && driver) setFilter(driver.visible, driver.x.length);
  }
  $effect(() => {
    const d = driver;
    if (!d) return;
    const v = d.visible;
    // A point coming back into view may be parked at a stale spot (it was hidden through
    // a position change); then this is a draw, not just a filter, so it flies home.
    const { x, y } = untrack(() => d);
    const stale = !!shownX && !!shownY && v.some((i) => shownX![i] !== x[i] || shownY![i] !== y[i]);
    if (stale) { lastX = new Float32Array(0); redrawTick++; } // ≠ x, so the draw transitions
    else applyFilter();
  });

  /**
   * Framing. `focus` zooms to a set of points; clearing it goes back to the whole data
   * square, with a transition either way. Queued behind any draw in flight so the camera
   * never chases points still moving.
   */
  let lastFrame: number[] | null = null;
  $effect(() => {
    const k = driver?.focus ?? null;
    if (!plot || !driver) return;
    /**
     * Wait for the set to settle before framing it. A filter change (a lasso being applied)
     * shrinks `visible`, which can force a full positional redraw of every point — framing
     * in the same tick put a camera transition on top of that draw, and on a large lasso the
     * two together locked the page up. `drawn` goes false while a positional draw is in
     * flight and true when it lands, so reading it here defers the zoom to the frame after
     * the points have stopped moving. It is also what we want visually: the camera should
     * chase a settled set, not one mid-flight.
     */
    if (!drawn) return;
    const had = lastFrame;
    lastFrame = k;
    const p = plot;
    if (k && k.length) {
      enqueueZoom(() => settle(p.zoomToPoints(k, { padding: 0.25, transition: true, transitionDuration: 600 }), 1500));
    } else if (had) {
      // Not `reset()`: that re-creates the camera with no transition (and doesn't take
      // while the camera is fixed). Frame the whole data square the same way we framed
      // the subset, so out mirrors in.
      enqueueZoom(() => settle(p.zoomToArea({ x: -1, y: -1, width: 2, height: 2 }, { transition: true, transitionDuration: 600 }), 1500));
    }
  });

  // --- overlay -------------------------------------------------------------------------
  let raf = 0;
  function scheduleOverlay() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; drawOverlay(); });
  }
  $effect(() => { void hovered; void driver; void width; void height; scheduleOverlay(); });

  /**
   * regl's own point scale (`pointScaleMode: 'asinh'`, its default — we never set it), from
   * `getAsinhPointScale`. It multiplies in `devicePixelRatio`, which is right for the GL
   * buffer but not for the overlay: `getScreenPosition` hands back CSS pixels and the 2d
   * context is already transformed by dpr. So take the camera part only.
   */
  function pointScale(): number {
    const scaling = (plot?.get('camera') as { scaling?: number[] } | undefined)?.scaling?.[0];
    if (!scaling || !Number.isFinite(scaling)) return 1;
    // Zoomed out, regl floors the scale at MIN_POINT_SIZE / pointSize[0] — 1/1 for our
    // size table, whose first entry is 1px.
    const minScale = 1 / SIZE_TABLE[0];
    return scaling > 1
      ? Math.asinh(Math.max(1, scaling)) / Math.asinh(1)
      : Math.max(minScale, scaling);
  }

  function drawOverlay() {
    if (!overlay || !plot || !theme || width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (overlay.width !== Math.round(width * dpr)) { overlay.width = Math.round(width * dpr); overlay.height = Math.round(height * dpr); }
    const ctx = overlay.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = `600 12px ${theme.font}`;
    ctx.textBaseline = 'middle';
    const p = plot;
    driver?.overlay?.(ctx, {
      screen: (i) => { const s = p.getScreenPosition(toSlot(i)); return s ? [s[0], s[1]] : null; },
      width, height, theme, hovered, drawn, dragging, pointScale: pointScale()
    });
  }

  // --- export ----------------------------------------------------------------------------
  // The hard limit is WebGL's framebuffer side (16384 px). Area is only a guard against
  // the PNG encode, which runs on the main thread and takes seconds per 100 MP; it is set
  // where that becomes a freeze rather than a wait.
  const MAX_SIDE = 16384, MAX_PIXELS = 160e6;
  function maxExportScale(): number {
    const dpr = window.devicePixelRatio || 1;
    if (!width || !height) return 1;
    const bySide = MAX_SIDE / (Math.max(width, height) * dpr);
    const byArea = Math.sqrt(MAX_PIXELS / (width * height * dpr * dpr));
    return Math.max(1, Math.floor(Math.min(bySide, byArea)));
  }
  async function exportPng({ scale, title, transparent }: ExportOptions): Promise<Blob> {
    if (!plot || !theme) throw new Error('canvas not ready');
    const max = maxExportScale();
    if (scale > max) throw new Error(`scale ${scale}× is beyond what this canvas can render (max ${max}×)`);
    // regl's off-screen render comes back on alpha whatever the background setting, so
    // the background is ours to lay down (or leave out, for print).
    // regl's export waits for a draw that never comes if the framebuffer fails, so it is
    // raced against a deadline rather than trusted.
    const img = await Promise.race([
      plot.export({ scale, antiAliasing: 0.5 * scale, pixelAligned: false }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('export timed out — try a smaller scale')), 60_000))
    ]);
    const pts = document.createElement('canvas');
    pts.width = img.width; pts.height = img.height;
    pts.getContext('2d')!.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = img.width; out.height = img.height;
    const ctx = out.getContext('2d')!;
    if (!transparent) { ctx.fillStyle = theme.background; ctx.fillRect(0, 0, out.width, out.height); }
    ctx.drawImage(pts, 0, 0);
    // The overlay in on-screen coordinates under a uniform scale: the same placement the
    // viewer sees, rendered at the export's resolution.
    const s = img.width / width;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.font = `600 12px ${theme.font}`;
    ctx.textBaseline = 'middle';
    const p = plot;
    driver?.overlay?.(ctx, {
      screen: (i) => { const q = p.getScreenPosition(toSlot(i)); return q ? [q[0], q[1]] : null; },
      // On-screen scale, not the export's: the uniform transform above already carries the
      // resolution multiple, so markers match what the viewer saw.
      width, height, theme, hovered: -1, drawn: true, dragging: false, pointScale: pointScale()
    });
    if (title) {
      ctx.font = `600 16px ${theme.font}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = theme.foreground;
      ctx.fillText(title, 14, height - 14);
    }
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
  }
  $effect(() => { api = { exportPng, maxExportScale }; return () => { api = null; }; });

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
    // the library) that its typings omit. With a size *table*, regl's auto hit radius is
    // the table's max (20px + 4): a 2px dot 24px from the cursor would be "hovered" and the
    // ring would jump to it. A small fixed radius; regl still picks the nearest within it.
    plot = createScatterplot({
      pointSizeMouseDetection: 4,
      canvas: glCanvas,
      width: 'auto',
      height: 'auto',
      pointSize: SIZE_TABLE,
      sizeBy: 'valueB',
      colorBy: 'valueA',
      opacity: 0.5,
      pointOutlineWidth: 0,
      deselectOnDblClick: false,
      deselectOnEscape: true,
      lassoOnLongPress: lasso,
      // Sample the pointer every frame and every pixel — the defaults (10ms / 3px) drew a
      // visibly jagged polygon. Without a lasso, the distance is only the click threshold.
      lassoMinDelay: 0,
      lassoMinDist: lasso ? 1 : 4,
      lassoLineWidth: 1.5
    } as Parameters<typeof createScatterplot>[0]);
    // Dev-only handle for poking at the plot from the console / headless checks.
    if (dev) (window as unknown as { __map: unknown }).__map = plot;
    // regl reports DRAW SLOTS; `hovered` and every layer callback speak layer indices.
    plot.subscribe('pointOver', (k) => { const i = toLayer(k); hovered = i; driver?.onhover?.(i); });
    plot.subscribe('pointOut', () => { hovered = -1; driver?.onhover?.(-1); });
    // The highlight is ours (the overlay), so regl's own selection is dropped straight
    // after — otherwise its tint would linger and its next click would replace, not toggle.
    plot.subscribe('select', ({ points }) => {
      plot?.deselect({ preventEvent: true });
      driver?.onselect?.(points.map(toLayer));
    });
    // Paint the overlay in the same frame regl paints the points: regl emits `draw` from
    // inside its own animation frame, and deferring to the next one leaves rings and
    // labels trailing the dots by a frame while panning — visible as a wobble.
    plot.subscribe('draw', () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } drawOverlay(); });
    const reset = () => plot?.reset();
    glCanvas.addEventListener('dblclick', reset);
    // A drag, for layers that hide their markers while panning: down on the canvas, up
    // anywhere (the pointer may leave the canvas mid-drag).
    const down = () => { dragging = true; };
    const up = () => { if (dragging) { dragging = false; scheduleOverlay(); } };
    glCanvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);

    // Size is regl's job: with width/height 'auto' it observes its own canvas and keeps the
    // camera, aspect ratio and pointer mapping in step. This observer only sizes the overlay.
    const ro = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
    });
    ro.observe(host);
    const mo = new MutationObserver(() => { theme = readTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      ro.disconnect(); mo.disconnect();
      glCanvas.removeEventListener('dblclick', reset);
      glCanvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      if (raf) cancelAnimationFrame(raf);
      plot?.destroy(); plot = null;
    };
  }
</script>

<div class="host" class:lasso={mode === 'lasso'} class:fixed-camera={cameraFixed} class:inert={!interactive} class:frameless={!frame} bind:this={host}>
  <canvas bind:this={glCanvas} class="gl"></canvas>
  <canvas bind:this={overlay} class="overlay" style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
  {@render children?.()}
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
</style>
