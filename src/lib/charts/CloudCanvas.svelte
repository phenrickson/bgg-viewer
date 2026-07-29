<script lang="ts">
  /**
   * SPIKE — the point cloud, drawn in a single imperative canvas loop.
   *
   * This is the whole reason a custom layer exists: LayerChart's <Points> renders one
   * <Circle> component per point (component-per-point + a hit-canvas pass), which costs
   * ~0.1ms/point → seconds at 30k. Here we draw every point with one `fillRect` loop
   * (~µs/point), using scales handed down from the parent <Chart>. LayerChart still owns
   * the scales, axes, and the quadtree tooltip (which hit-tests off the data array, not
   * off how the cloud is drawn) — so hover still works.
   *
   * A sibling of the chart's <Svg>/<Canvas> layers: absolute-positioned over the plot,
   * translated by the chart padding, DPR-scaled — mirroring what layers/Canvas.svelte does.
   */
  // d3 scales are callable (value → pixel); typed loosely to avoid scale-generic friction.
  type Scale = (value: number) => number;

  let {
    xs,
    ys,
    xScale,
    yScale,
    containerWidth,
    containerHeight,
    padding,
    color = 'var(--chart-1)',
    r = 1.8,
    opacity = 0.35
  }: {
    xs: ArrayLike<number>;
    ys: ArrayLike<number>;
    xScale: Scale;
    yScale: Scale;
    containerWidth: number;
    containerHeight: number;
    padding: { top?: number; left?: number; right?: number; bottom?: number };
    color?: string;
    r?: number;
    opacity?: number;
  } = $props();

  let canvas = $state<HTMLCanvasElement>();

  // Redraw when the theme flips (canvas can't resolve CSS vars reactively on its own).
  let themeTick = $state(0);
  $effect(() => {
    const obs = new MutationObserver(() => themeTick++);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => themeTick++;
    mq.addEventListener('change', onMq);
    return () => {
      obs.disconnect();
      mq.removeEventListener('change', onMq);
    };
  });

  $effect(() => {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // Reactive dependencies (read them so the effect re-runs on change).
    const px = xScale,
      py = yScale,
      _xs = xs,
      _ys = ys,
      cw = containerWidth,
      ch = containerHeight;
    themeTick; // theme dependency

    const padL = padding?.left ?? 0;
    const padT = padding?.top ?? 0;
    const dpr = window.devicePixelRatio || 1;

    el.width = Math.max(1, Math.round(cw * dpr));
    el.height = Math.max(1, Math.round(ch * dpr));
    el.style.width = `${cw}px`;
    el.style.height = `${ch}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.translate(padL, padT);

    // Resolve the CSS-var color against the element (theme-aware).
    el.style.color = color;
    ctx.fillStyle = getComputedStyle(el).color;
    ctx.globalAlpha = opacity;

    const n = Math.min(_xs.length, _ys.length);
    const d = r;
    const h = d / 2;
    for (let i = 0; i < n; i++) {
      const sx = px(_xs[i]);
      const sy = py(_ys[i]);
      if (sx === sx && sy === sy) ctx.fillRect(sx - h, sy - h, d, d); // sx===sx skips NaN
    }
    ctx.globalAlpha = 1;
  });
</script>

<canvas bind:this={canvas} class="cloud" aria-hidden="true"></canvas>

<style>
  .cloud {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
