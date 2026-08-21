<script lang="ts">
  /**
   * One chart, as a full-width section down the foot of the landing page.
   *
   * Styled as an editorial section rather than a card: a hairline rule, an eyebrow, a large
   * title, and the plot running the full measure. A bordered box would read as a widget
   * parked on the page; this reads as something to scroll through, which is what it is for.
   *
   * Reuses [Scatter](../charts/Scatter.svelte), which is deliberately display-only — no
   * hit-testing, no tooltip, because these plots illustrate a claim rather than serving as a
   * way to find a game. Exactly the contract a landing section wants. Columns are drawn
   * inline: `MiniColumns` is a 46px filter control built around `onpick`, and this needs
   * neither the interaction nor the size.
   *
   * Copy is PLACEHOLDER — Phil writes the final strings.
   */
  import Scatter from '$lib/charts/Scatter.svelte';
  import { line as d3Line, area as d3Area, curveMonotoneX } from 'd3-shape';
  import { reveal } from './reveal';
  import type { Viz } from './types';

  /** Smoothed paths, matching the curve `TimeSeriesArea` already uses elsewhere in the app —
   *  a raw connect-the-dots polyline through noisy year-over-year data reads as jagged/amateur. */
  const linePath = d3Line<{ x: number; y: number }>()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(curveMonotoneX);
  const areaPath = d3Area<{ x: number; y: number }>()
    .x((d) => d.x)
    .y0(100)
    .y1((d) => d.y)
    .curve(curveMonotoneX);
  /** Same idea as `areaPath`, but `y0` is per-point rather than a constant 100 — a ridge
   *  lane's baseline is wherever ITS OWN slot sits, not the bottom of the whole plot. */
  const ridgeArea = d3Area<{ x: number; y: number; baseline: number }>()
    .x((d) => d.x)
    .y0((d) => d.baseline)
    .y1((d) => d.y)
    .curve(curveMonotoneX);

  let {
    viz,
    eyebrow,
    onprev,
    onnext
  }: { viz: Viz; eyebrow: string; onprev?: () => void; onnext?: () => void } = $props();

  const HEIGHT = 360;

  /** Column geometry as percentages, so the bars reflow with the section. */
  const colMax = $derived(
    viz.kind === 'columns' ? Math.max(1, ...viz.bins.map(([, n]) => n)) : 1
  );
  const colTotal = $derived(
    viz.kind === 'columns' ? viz.bins.reduce((s, [, n]) => s + n, 0) : 0
  );

  const cols = $derived.by(() => {
    if (viz.kind !== 'columns') return [];
    const every = viz.tickEvery ?? Math.ceil(viz.bins.length / 8);
    const dp = viz.precision ?? 0;
    const wide = viz.bins.length <= 12; // room to print a number on every bar
    return viz.bins.map(([v, n], i) => ({
      v,
      n,
      h: (n / colMax) * 100,
      lit: viz.callout?.at === v,
      // Labelled by INDEX, not value. Labelling on `v % 5` works for years and produces
      // nothing at all for a rating axis running 3.0–9.5 in half-points.
      label: i % every === 0 || i === viz.bins.length - 1 ? v.toFixed(dp) : '',
      // Only where the bars are wide enough that the numbers won't collide.
      value: wide ? n.toLocaleString() : ''
    }));
  });

  /** Three gridlines, so a bar's height reads as a quantity rather than a silhouette. */
  const gridlines = $derived.by(() => {
    if (viz.kind !== 'columns') return [];
    const step = Math.pow(10, Math.floor(Math.log10(colMax)));
    const nice = colMax / step > 5 ? step * 2 : colMax / step > 2 ? step : step / 2;
    const out: { n: number; pct: number }[] = [];
    for (let n = nice; n <= colMax; n += nice) out.push({ n, pct: (n / colMax) * 100 });
    return out.slice(-4);
  });

  const share = (n: number) => (colTotal ? Math.round((n / colTotal) * 100) : 0);

  /**
   * Axis ticks for the scatter. `Scatter` draws ticks only for values it is handed, and it was
   * being handed none — so the cloud had labelled axes with no numbers on them, and a reader
   * could see a shape but not say where anything sat. Derived from the data rather than
   * declared in the content, so a new series never ships with ticks that miss its range.
   */
  const ticks = $derived.by(() => {
    if (viz.kind !== 'scatter') return { x: [] as number[], y: [] as number[] };

    const linear = (lo: number, hi: number) => {
      const raw = (hi - lo) / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = raw / mag > 5 ? 10 * mag : raw / mag > 2 ? 5 * mag : raw / mag > 1 ? 2 * mag : mag;
      const out: number[] = [];
      for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
        out.push(Math.round(t * 1000) / 1000);
      }
      return out;
    };

    /* Powers of ten, plus their halves where the span is short enough to need them.
       `Scatter` takes ticks in DATA space and logs them itself, so evenly-spaced linear
       ticks on a log axis would bunch into an unreadable smear at the right-hand end. */
    const log = (lo: number, hi: number) => {
      const out: number[] = [];
      const from = Math.max(1, Math.floor(Math.log10(Math.max(1, lo))));
      const to = Math.ceil(Math.log10(hi));
      const sparse = to - from > 3;
      for (let e = from; e <= to; e++) {
        const base = Math.pow(10, e);
        if (base >= lo && base <= hi) out.push(base);
        if (!sparse && base * 5 >= lo && base * 5 <= hi) out.push(base * 5);
      }
      return out.sort((a, b) => a - b);
    };

    const axis = (vals: number[], isLog: boolean) => {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      if (!Number.isFinite(lo) || hi === lo) return [];
      return isLog ? log(lo, hi) : linear(lo, hi);
    };

    return {
      x: axis(viz.points.map((p) => p[0]), !!viz.xLog),
      y: axis(viz.points.map((p) => p[1]), !!viz.yLog)
    };
  });

  /**
   * Jitter sized to the axis, not hardcoded.
   *
   * A fixed `jitterX={0.04}` is right for complexity (0–5) and meaningless for a playing-time
   * axis running to 300 or a vote count running to 135,000. It is also wrong on a log axis,
   * where a constant displacement in data units is enormous at the low end and invisible at
   * the high end. So: half a percent of the span, linear axes only.
   */
  const jitter = $derived.by(() => {
    if (viz.kind !== 'scatter') return {};
    const span = (i: 0 | 1) => {
      const v = viz.points.map((p) => p[i]);
      return Math.max(...v) - Math.min(...v);
    };
    return {
      jitterX: viz.xLog ? 0 : span(0) * 0.005,
      jitterY: viz.yLog ? 0 : span(1) * 0.005
    };
  });

  /** Horizontal bars, widths relative to the largest. */
  const rows = $derived.by(() => {
    if (viz.kind !== 'bars') return [];
    const max = Math.max(1, ...viz.bars.map((b) => b.value));
    return viz.bars.map((b) => ({ ...b, w: (b.value / max) * 100 }));
  });

  /**
   * `style: 'dots'` — each value positioned on a scale zoomed to the data's own range (with
   * ~12% padding so extreme dots aren't flush against the track ends), rather than a
   * zero-baseline bar. See the `style` field's doc comment in types.ts for why: a bar's
   * length-from-zero is honest for counts and useless for something like an average rating,
   * where the whole story is a half-point band and every bar would end up nearly full-length.
   *
   * Lollipop, not a bare dot: a thin stem back to the track's left edge anchors each dot to
   * its row so a reader's eye doesn't have to hunt for which label a floating dot belongs to.
   * The stem carries no numeric claim of its own — the axis is zoomed and its ticks say so —
   * it is purely a visual tether.
   *
   * The dot itself is colored along the same one-hue sequential ramp `Scatter.svelte` uses
   * for its own value coloring (`seq()` there) — same construction, reused rather than
   * inventing a second ramp, so "pale/low → dark/saturated/high" means the same thing
   * anywhere this app colors a value.
   */
  const dotPlot = $derived.by(() => {
    if (viz.kind !== 'bars' || viz.style !== 'dots') return null;
    const values = viz.bars.map((b) => b.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
    const domainLo = lo - pad;
    const domainHi = hi + pad;
    const pct = (v: number) => ((v - domainLo) / (domainHi - domainLo)) * 100;
    const color = (v: number) => {
      const u = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0.5;
      return `oklch(${0.86 - 0.34 * u} ${0.04 + 0.13 * u} 250)`;
    };

    // Nice x-axis ticks across the zoomed domain — same stepping idea used elsewhere.
    const step = (() => {
      const raw = (domainHi - domainLo) / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      return raw / mag > 5 ? 10 * mag : raw / mag > 2 ? 5 * mag : raw / mag > 1 ? 2 * mag : mag;
    })();
    const ticks: { v: number; pct: number }[] = [];
    for (let t = Math.ceil(domainLo / step) * step; t <= domainHi; t += step) {
      ticks.push({ v: Math.round(t * 100) / 100, pct: pct(t) });
    }

    return {
      ticks,
      rows: viz.bars.map((b) => ({ ...b, pct: pct(b.value), color: color(b.value) }))
    };
  });

  /**
   * One or more trend lines sharing an x-axis (year). Percentages throughout, not pixels or
   * viewBox units — the polyline and the HTML tick/end labels are positioned from the same
   * two functions, so a text label and the geometry it names can never disagree about where
   * they sit. (An SVG viewBox with `preserveAspectRatio="none"` scales x/y non-uniformly to
   * fill the section's width, which would visibly squash text glyphs if it drew them too —
   * so only the polyline geometry lives in the SVG; every label is a plain absolutely
   * positioned span, same technique the columns chart already uses for its gridlines.)
   */
  const linePlot = $derived.by(() => {
    if (viz.kind !== 'line') return null;
    const xs = viz.points.map((p) => p.x);
    const xLo = Math.min(...xs);
    const xHi = Math.max(...xs);
    const yHi = Math.max(
      1,
      ...viz.series.flatMap((s) => viz.points.map((p) => p[s.key]).filter((v) => v != null))
    );

    const leftPct = (x: number) => (xHi === xLo ? 0 : ((x - xLo) / (xHi - xLo)) * 100);
    const bottomPct = (y: number) => (y / yHi) * 100;

    // Nice y gridlines — same stepping idea as the columns chart's.
    const step = (() => {
      const raw = yHi / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      return raw / mag > 5 ? 10 * mag : raw / mag > 2 ? 5 * mag : raw / mag > 1 ? 2 * mag : mag;
    })();
    const gridlines: { v: number; pct: number }[] = [];
    for (let v = step; v <= yHi; v += step) gridlines.push({ v, pct: bottomPct(v) });

    // ~6 evenly spaced year ticks, plus the final year so the range's edge always shows.
    const xStep = Math.max(1, Math.round((xHi - xLo) / 6));
    const xticks: { x: number; pct: number }[] = [];
    for (let x = Math.ceil(xLo / xStep) * xStep; x <= xHi; x += xStep) {
      xticks.push({ x, pct: leftPct(x) });
    }
    if (xticks[xticks.length - 1]?.x !== xHi) xticks.push({ x: xHi, pct: leftPct(xHi) });

    // Cycles through the app's 6 categorical tokens — a 7th series would repeat a color,
    // which every current viz avoids by construction (`checkSeriesCount` in lib.js throws
    // past 6 series at build time rather than letting it happen silently).
    // Only a single series gets an area fill: overlapping semi-transparent fills from several
    // series would just muddy each other, where one line reads cleanly against its own area.
    const lines = viz.series.map((s, i) => {
      // `viz.points` is already sorted ascending by x (the `line()` builder guarantees it), and
      // filtering preserves that order — so the last element is the series' true last point,
      // even if a series doesn't have a value at every x.
      const pts = viz.points
        .filter((p) => p[s.key] != null)
        .map((p) => ({ x: leftPct(p.x), y: 100 - bottomPct(p[s.key]) }));
      const last = pts[pts.length - 1];
      return {
        key: s.key,
        label: s.label,
        d: linePath(pts) ?? '',
        fillD: viz.series.length === 1 ? (areaPath(pts) ?? '') : null,
        color: `var(--chart-${(i % 6) + 1})`,
        endLeft: last?.x ?? 0,
        endTop: last?.y ?? 0
      };
    });

    /**
     * Declutter end labels that land close enough to overlap — two series ending at nearly
     * the same share (a real case: two mechanics 0.2 points apart) otherwise stack their
     * labels exactly on top of each other, and only the last-drawn one is ever readable.
     * `labelTop` is a separate, nudged position for the TEXT only; `endTop`/`endLeft` (used
     * for nothing else right now, but kept) still describe where the line actually ends.
     */
    const MIN_LABEL_GAP = 6;
    const order = lines.map((l, i) => ({ i, t: l.endTop })).sort((a, b) => a.t - b.t);
    const placed = order.map((o) => o.t);
    for (let k = 1; k < placed.length; k++) {
      if (placed[k] - placed[k - 1] < MIN_LABEL_GAP) placed[k] = placed[k - 1] + MIN_LABEL_GAP;
    }
    const overflow = placed[placed.length - 1] - 100;
    if (overflow > 0) for (let k = 0; k < placed.length; k++) placed[k] -= overflow;
    const labelTop = new Array(lines.length);
    order.forEach((o, k) => (labelTop[o.i] = placed[k]));
    const linesWithLabels = lines.map((l, i) => ({ ...l, labelTop: labelTop[i] }));

    /**
     * A gutter reserved to the RIGHT of the plot for end labels, sized to the longest one —
     * not a flat guess. Standard practice for direct end-of-line labeling is to reserve
     * dedicated margin rather than let labels sit over the plotted lines/gridlines; ~0.42rem
     * per character at this font-size plus fixed padding, clamped so one long label can't
     * eat the whole section and one short one doesn't waste it.
     */
    const longest = Math.max(0, ...viz.series.map((s) => s.label.length));
    const gutterRem = Math.min(11, Math.max(4, longest * 0.42 + 0.9));

    return { gridlines, xticks, lines: linesWithLabels, gutterRem };
  });

  /**
   * Stacked vertical bars, normalized to 100% per column — the split (share of releases with
   * X vs. without) is the trend this chart exists to show, and a common 0-100 baseline puts
   * every column's share on the same position scale, the top tier of the Cleveland-McGill
   * hierarchy. Segments are positioned absolutely (`bottom`/`height`, both percentages of that
   * column's own total) rather than relying on flex stacking order — flex's
   * `justify-content: end` packs from the LAST DOM child, which would put `viz.series[0]`
   * (meant to anchor the bottom, touching the axis) at the top instead.
   *
   * The underlying counts (which is what actually distinguishes this from just plotting a
   * `line` of shares) move to a hover tooltip instead of an always-on in-bar label — once every
   * column reaches full height, position alone already shows the share; a persistent label
   * repeating it in text is now redundant clutter across 36 narrow columns.
   *
   * Color: the thing being highlighted gets `--primary` (BGG orange); everything else is
   * `--chart-1` darkened rather than full grey — grey read as "no data here" instead of "a
   * real category, just not the one this chart is about," and dropped the blue-vs-orange
   * identity the legend swatch relies on. Darkening (not just muting) is what keeps it from
   * competing with the orange, since "everything else" is usually most of the bar's area.
   * `series[0]` is always the highlighted segment — every current `stack` viz is a "has X vs.
   * everything else" split, by construction, so there's only ever one baseline tone to pick.
   */
  const stackPlot = $derived.by(() => {
    if (viz.kind !== 'stack') return null;
    const every = viz.tickEvery ?? Math.ceil(viz.points.length / 8);
    const color = (si: number) =>
      si === 0 ? 'var(--primary)' : 'color-mix(in oklch, var(--chart-1) 55%, black)';
    const legend = viz.series.map((s, si) => ({ key: s.key, label: s.label, color: color(si) }));

    // Every column is normalized to the same 0-100 scale, so the gridlines are fixed quarters
    // rather than computed from the data's own magnitude.
    const gridlines = [25, 50, 75].map((n) => ({ n, pct: n }));

    const cols = viz.points.map((p, i) => {
      const raw = viz.series.map((s) => p[s.key] ?? 0);
      const total = raw.reduce((a, b) => a + b, 0);
      let cum = 0;
      const segs = viz.series.map((s, si) => {
        const v = raw[si];
        const h = total > 0 ? (v / total) * 100 : 0;
        const seg = {
          key: s.key,
          label: s.label,
          v,
          h,
          bottom: total > 0 ? (cum / total) * 100 : 0,
          color: color(si)
        };
        cum += v;
        return seg;
      });
      const labelled = i % every === 0 || i === viz.points.length - 1;
      return {
        x: p.x,
        total,
        segs,
        label: labelled ? String(p.x) : ''
      };
    });

    // Sized to THIS chart's own longest label, not a shared constant across every stack viz —
    // a fixed 11rem (big enough for "Solo / Solitaire Game") left a wide dead-space gap on
    // charts with short labels like "Kickstarter"/"Everything else". Same formula the line
    // chart uses for its own end-label gutter. Trade-off: plot width now varies slightly
    // chart-to-chart with label length, instead of being pixel-identical — a much smaller sin
    // than the wasted space was.
    const longestLabel = Math.max(0, ...legend.map((s) => s.label.length));
    const legendRem = Math.min(11, Math.max(4, longestLabel * 0.42 + 0.9));

    return { gridlines, cols, legend, legendRem };
  });

  /**
   * A dot (median) plus a whisker (25th-75th percentile) per discrete category. Domain is
   * padded on both ends like `Scatter`'s, rather than zero-anchored like `columns` — a rating
   * axis running 5-8 would otherwise spend most of its height as dead space below the data.
   */
  const rangePlot = $derived.by(() => {
    if (viz.kind !== 'range') return null;
    const lo = Math.min(...viz.points.map((p) => p.low));
    const hi = Math.max(...viz.points.map((p) => p.high));
    const pad = (hi - lo) * 0.08 || 0.5;
    const domainLo = lo - pad;
    const domainHi = hi + pad;
    const pct = (v: number) => ((v - domainLo) / (domainHi - domainLo)) * 100;

    // Nice y gridlines — same stepping idea as everywhere else in this file.
    const step = (() => {
      const raw = (domainHi - domainLo) / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      return raw / mag > 5 ? 10 * mag : raw / mag > 2 ? 5 * mag : raw / mag > 1 ? 2 * mag : mag;
    })();
    const gridlines: { v: number; pct: number }[] = [];
    for (let v = Math.ceil(domainLo / step) * step; v <= domainHi; v += step) {
      gridlines.push({ v: Math.round(v / step) * step, pct: pct(v) });
    }

    const dp = viz.precision ?? 1;
    const cols = viz.points.map((p) => ({
      x: p.x,
      lowPct: pct(p.low),
      highPct: pct(p.high),
      midPct: pct(p.mid),
      mid: p.mid.toFixed(dp)
    }));

    return { gridlines, cols };
  });

  /**
   * Overlapping density lanes, one per group in `viz.lanes`' own order — top to bottom, which
   * is ALSO paint order: earlier lanes are drawn first (further back), later ones drawn on top
   * of them (nearer), so the bottom-most lane's peaks are never hidden behind the ones above
   * it. That's the classic ridgeline/joyplot look.
   *
   * All lanes share one `viewBox="0 0 100 100"` SVG, `preserveAspectRatio="none"` — same
   * technique as the line chart's: curve geometry tolerates the non-uniform x/y stretch a
   * fluid-width section needs, but lane LABELS live outside the SVG as plain HTML (stretched
   * text would visibly squash the glyphs).
   */
  const ridgePlot = $derived.by(() => {
    if (viz.kind !== 'ridge') return null;
    const n = viz.lanes.length;
    // How far above its own baseline a lane's peak may rise, in multiples of one lane's own
    // slot height — >1 is what produces the overlap a ridgeline is named for.
    const RISE = 1.7;
    // The topmost lane has no lane above it to rise into, so it needs real headroom reserved
    // ABOVE baseline 0, not just enough room for the other n-1 lanes — otherwise its peak has
    // nowhere to go and either clips (renders outside the viewBox) or gets clamped flat,
    // showing a wrong shape instead of its real one. Solved for the padding that makes even a
    // maximum-height peak in lane 0 land exactly at y=0.
    const topPad = (100 * (RISE - 1)) / (n + RISE - 1);
    const laneH = (100 - topPad) / n;
    const globalMax = Math.max(1e-9, ...viz.lanes.flatMap((l) => l.density));

    const xLo = viz.grid[0];
    const xHi = viz.grid[viz.grid.length - 1];
    const leftPct = (x: number) => (xHi === xLo ? 0 : ((x - xLo) / (xHi - xLo)) * 100);

    const lanes = viz.lanes.map((lane, i) => {
      const baseline = topPad + (i + 1) * laneH;
      const pts = viz.grid.map((x, bi) => ({
        x: leftPct(x),
        // Still clamped to 0 as a last resort (rounding, or a future RISE/n combo the
        // `topPad` formula wasn't tuned for) — but `topPad` is what actually prevents this
        // from being needed in the normal case.
        y: Math.max(0, baseline - (lane.density[bi] / globalMax) * RISE * laneH),
        baseline
      }));

      // The median marker's y — the curve's own height at the nearest grid point to the
      // median, so the line visibly lands ON the curve rather than floating at some unrelated
      // height.
      let medianIdx = 0;
      let bestDist = Infinity;
      for (let bi = 0; bi < viz.grid.length; bi++) {
        const d = Math.abs(viz.grid[bi] - lane.median);
        if (d < bestDist) {
          bestDist = d;
          medianIdx = bi;
        }
      }

      return {
        label: lane.label,
        baseline,
        areaD: ridgeArea(pts) ?? '',
        lineD: linePath(pts) ?? '',
        medianX: leftPct(lane.median),
        medianY: pts[medianIdx].y
      };
    });

    // Shared x-axis ticks — same "nice step" idea as everywhere else in this file.
    const step = (() => {
      const raw = (xHi - xLo) / 6;
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      return raw / mag > 5 ? 10 * mag : raw / mag > 2 ? 5 * mag : raw / mag > 1 ? 2 * mag : mag;
    })();
    const dp = viz.precision ?? 1;
    const xticks: { v: string; pct: number }[] = [];
    for (let v = Math.ceil(xLo / step) * step; v <= xHi; v += step) {
      xticks.push({ v: v.toFixed(dp), pct: leftPct(v) });
    }
    if (!xticks.length || xticks[xticks.length - 1].pct < 99) {
      xticks.push({ v: xHi.toFixed(dp), pct: leftPct(xHi) });
    }

    // Gutter reserved for lane labels, sized to the longest one — same technique as the line
    // chart's `gutterRem`.
    const longest = Math.max(0, ...viz.lanes.map((l) => l.label.length));
    const gutterRem = Math.min(12, Math.max(5, longest * 0.5 + 0.6));

    // A fixed height per lane, not a floor-clamped formula — every lane needs the same room
    // regardless of how many there are, so it's just `n * one lane's worth`.
    const LANE_PX = 58;
    return { lanes, xticks, gutterRem, height: n * LANE_PX };
  });
</script>

<section class="sec" use:reveal aria-label={viz.title}>
  <header>
    <div class="titles">
      <p class="eyebrow">{eyebrow}</p>
      <h2>{viz.title}</h2>
      <p class="note">{viz.note}</p>
    </div>
    {#if onprev || onnext}
      <div class="nav">
        <button type="button" onclick={onprev} aria-label="Previous chart">←</button>
        <button type="button" onclick={onnext} aria-label="Next chart">→</button>
      </div>
    {/if}
  </header>

  {#if viz.kind === 'scatter'}
    <Scatter
      points={viz.points.map(([x, y]) => ({ x, y }))}
      annotations={viz.annotations ?? []}
      xLabel={viz.xLabel}
      yLabel={viz.yLabel}
      xTicks={viz.xTicks ?? ticks.x}
      yTicks={ticks.y}
      xLog={viz.xLog ?? false}
      yLog={viz.yLog ?? false}
      xPlain={viz.xPlain ?? false}
      height={HEIGHT}
      {...jitter}
    />
  {:else if viz.kind === 'columns'}
    <div class="colwrap">
      <div class="plot" style="height: {HEIGHT}px">
        <!-- Gridlines behind the bars, labelled on the left. Without them the tallest bar is
             just "the tallest" and the reader has no idea whether it is 300 games or 3,000. -->
        {#each gridlines as g (g.n)}
          <div class="grid" style="bottom: {g.pct}%">
            <span class="gval">{g.n.toLocaleString()}</span>
          </div>
        {/each}

        <div class="cols" role="img" aria-label="{viz.yLabel} by {viz.xLabel}">
          {#each cols as c (c.v)}
            <div class="col">
              <div class="stack" style="height: {c.h}%">
                {#if c.value}<span class="cval">{c.value}</span>{/if}
                <div class="bar" class:lit={c.lit} title="{c.v}: {c.n.toLocaleString()} ({share(c.n)}%)"></div>
              </div>
              <span class="tick">{c.label}</span>
            </div>
          {/each}
        </div>
      </div>

      {#if viz.callout}
        <p class="callout"><span class="mark" aria-hidden="true"></span>{viz.callout.text}</p>
      {/if}
    </div>
  {:else if viz.kind === 'line' && linePlot}
    <div class="plot lineplot" style="height: {HEIGHT}px">
      {#each linePlot.gridlines as g (g.v)}
        <div class="grid" style="bottom: {g.pct}%">
          <span class="gval">{g.v.toLocaleString()}{viz.yPercent ? '%' : ''}</span>
        </div>
      {/each}

      <div class="linearea" style="right: {linePlot.gutterRem}rem" role="img" aria-label="{viz.yLabel} by {viz.xLabel}">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="linesvg" aria-hidden="true">
          {#each linePlot.lines as s (s.key)}
            {#if s.fillD}
              <path d={s.fillD} style="fill: {s.color}" class="lineseriesfill" />
            {/if}
            <path
              d={s.d}
              style="stroke: {s.color}"
              class="lineseries"
              fill="none"
              vector-effect="non-scaling-stroke"
            />
          {/each}
        </svg>

        {#each linePlot.lines as s (s.key)}
          <span class="lineend" style="left: {s.endLeft}%; top: {s.labelTop}%; color: {s.color}">{s.label}</span>
        {/each}

        {#each linePlot.xticks as t (t.x)}
          <span class="linetick" style="left: {t.pct}%">{t.x}</span>
        {/each}
      </div>
    </div>
  {:else if viz.kind === 'stack' && stackPlot}
    <div class="stackwrap">
      <div class="stackrow">
        <div class="plot" style="height: {HEIGHT}px">
          {#each stackPlot.gridlines as g (g.n)}
            <div class="grid" style="bottom: {g.pct}%">
              <span class="gval">{g.n}%</span>
            </div>
          {/each}

          <div class="cols" role="img" aria-label="{viz.yLabel} by {viz.xLabel}">
            {#each stackPlot.cols as c (c.x)}
              <div class="col">
                <div class="stackbar">
                  {#each c.segs as seg (seg.key)}
                    <div
                      class="stackseg"
                      style="bottom: {seg.bottom}%; height: {seg.h}%; background: {seg.color}"
                    ></div>
                  {/each}
                  <div class="stacktip">
                    <p class="tipyear">{c.x}</p>
                    {#each c.segs as seg (seg.key)}
                      <p class="tiprow">
                        <i style="background: {seg.color}"></i>{seg.label}: {seg.v.toLocaleString()} ({Math.round(
                          seg.h
                        )}%)
                      </p>
                    {/each}
                  </div>
                </div>
                <span class="tick">{c.label}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- To the side, stacked vertically — not a horizontal row above the plot. -->
        <div class="legend" style="flex-basis: {stackPlot.legendRem}rem">
          {#each stackPlot.legend as s (s.key)}
            <span class="legenditem"><i style="background: {s.color}"></i>{s.label}</span>
          {/each}
        </div>
      </div>

      {#if viz.callout}
        <p class="callout"><span class="mark" aria-hidden="true"></span>{viz.callout.text}</p>
      {/if}
    </div>
  {:else if viz.kind === 'range' && rangePlot}
    <div class="plot" style="height: {HEIGHT}px">
      {#each rangePlot.gridlines as g (g.v)}
        <div class="grid" style="bottom: {g.pct}%">
          <span class="gval">{g.v.toFixed(viz.precision ?? 1)}</span>
        </div>
      {/each}

      <div class="cols" role="img" aria-label="{viz.yLabel} by {viz.xLabel}">
        {#each rangePlot.cols as c (c.x)}
          <div class="col">
            <div class="rangebar">
              <div class="rangewhisker" style="bottom: {c.lowPct}%; height: {c.highPct - c.lowPct}%"></div>
              <span class="rangeval" style="bottom: {c.midPct}%">{c.mid}</span>
              <div class="rangedot" style="bottom: {c.midPct}%"></div>
            </div>
            <span class="tick">{c.x}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else if viz.kind === 'ridge' && ridgePlot}
    <div class="ridgewrap" style="height: {ridgePlot.height}px">
      <div class="ridgelabels" style="width: {ridgePlot.gutterRem}rem" aria-hidden="true">
        {#each ridgePlot.lanes as lane (lane.label)}
          <span class="ridgelabel" style="top: {lane.baseline}%">{lane.label}</span>
        {/each}
      </div>

      <div class="ridgearea-wrap" style="left: {ridgePlot.gutterRem}rem" role="img" aria-label="{viz.yLabel} by {viz.xLabel}">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="ridgesvg" aria-hidden="true">
          {#each ridgePlot.lanes as lane (lane.label)}
            <path d={lane.areaD} class="ridgearea" />
            <path d={lane.lineD} class="ridgeline" vector-effect="non-scaling-stroke" />
            <line
              x1={lane.medianX}
              y1={lane.baseline}
              x2={lane.medianX}
              y2={lane.medianY}
              class="ridgemedian"
              vector-effect="non-scaling-stroke"
            />
          {/each}
        </svg>

        {#each ridgePlot.xticks as t (t.v)}
          <span class="ridgetick" style="left: {t.pct}%">{t.v}</span>
        {/each}
      </div>
    </div>
  {:else if viz.kind === 'bars' && viz.style === 'dots' && dotPlot}
    <div class="dotswrap" aria-label="{viz.yLabel} by {viz.xLabel}">
      <ul class="dots">
        {#each dotPlot.rows as b (b.label)}
          <li>
            <span class="blabel" title={b.label}>{b.label}</span>
            <span class="dot-track">
              {#each dotPlot.ticks as t (t.v)}
                <span class="dotgrid" style="left: {t.pct}%"></span>
              {/each}
              <span class="dotstem" style="width: {b.pct}%"></span>
              <span class="dotmark" style="left: {b.pct}%; background: {b.color}"></span>
              <span class="dotval" style="left: {b.pct}%; color: {b.color}">{b.value.toLocaleString()}</span>
            </span>
          </li>
        {/each}
      </ul>

      <!-- Axis last, at the bottom — matching where the columns and line charts put theirs. -->
      <div class="dots-axis">
        <span></span>
        <span class="dot-track">
          {#each dotPlot.ticks as t (t.v)}
            <span class="dotgrid" style="left: {t.pct}%"></span>
            <span class="dottick" style="left: {t.pct}%">{t.v}</span>
          {/each}
        </span>
      </div>
    </div>
  {:else if viz.kind === 'bars'}
    <ul class="bars" aria-label="{viz.yLabel} by {viz.xLabel}">
      {#each rows as b (b.label)}
        <li>
          <span class="blabel" title={b.label}>{b.label}</span>
          <span class="track"><span class="fill" style="width: {b.w}%"></span></span>
          <span class="bval">{b.value.toLocaleString()}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .sec { border-top: 1px solid var(--border); padding-top: var(--space-lg); }

  header { display: flex; align-items: start; gap: var(--space-lg); margin-bottom: var(--space-lg); }
  .titles { min-width: 0; }

  .eyebrow {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted-foreground); font-weight: 600; margin: 0 0 .35rem;
  }
  h2 {
    font-size: var(--text-heading, clamp(1.25rem, 1rem + 1vw, 1.75rem));
    font-weight: 750; letter-spacing: -0.02em; margin: 0; text-wrap: balance;
  }
  .note {
    font-size: 0.9rem; color: var(--muted-foreground); margin: .4rem 0 0;
    line-height: 1.45; max-width: 44rem;
  }

  .nav { display: flex; gap: .3rem; margin-left: auto; flex: none; }
  .nav button {
    width: 2rem; height: 2rem; line-height: 1; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--card);
    color: var(--muted-foreground); cursor: pointer;
  }
  .nav button:hover { color: var(--foreground); border-color: var(--primary); }

  /* Gridlines are absolutely positioned inside `.plot`, which the columns also fill — so the
     lines sit behind the bars without a stacking context that would hide the value labels. */
  .plot { position: relative; padding-left: 3.2rem; }
  .grid {
    position: absolute; left: 3.2rem; right: 0; height: 0;
    border-top: 1px dashed color-mix(in oklch, var(--border) 70%, transparent);
  }
  .gval {
    position: absolute; right: calc(100% + .5rem); top: -.55rem;
    font-size: 0.65rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .cols { display: flex; align-items: end; gap: 3px; height: 100%; position: relative; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: end; height: 100%; }
  /* The value rides on top of its own bar, so it moves with the height rather than needing
     to be positioned against the plot. */
  .stack { display: flex; flex-direction: column; justify-content: end; min-height: 1px; }
  .cval {
    font-size: 0.62rem; color: var(--muted-foreground); text-align: center;
    margin-bottom: .15rem; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: visible;
  }
  .bar { background: var(--chart-1); border-radius: 3px 3px 0 0; flex: 1; min-height: 1px; }
  .bar.lit { background: var(--primary); }
  .col:hover .bar { background: var(--primary); }

  /* The claim the chart is making, next to the bar that carries it. */
  .callout {
    display: flex; align-items: baseline; gap: .5rem;
    margin: var(--space-md) 0 0 3.2rem; font-size: 0.85rem; line-height: 1.45;
    color: var(--foreground);
  }
  .mark {
    flex: none; width: .7rem; height: .7rem; border-radius: 2px;
    background: var(--primary); transform: translateY(1px);
  }

  /* `overflow: visible` is load-bearing: a column is ~10px wide and "2005" is ~24px, so
     clipping to the column turned every label into "20". Only every fifth bucket is
     labelled, leaving ~5 columns of room to spill into without colliding. */
  .tick {
    font-size: 0.65rem; color: var(--muted-foreground); text-align: center;
    margin-top: .4rem; height: .9rem; overflow: visible; white-space: nowrap;
  }

  /* Legend above the plot — a stack's colors aren't self-explanatory the way a single-series
     bar's is, so unlike the other chart kinds this one needs a key. */
  /* Plot + legend side by side, not legend-above-plot — a vertical key reads more like a
     fixed reference than a header competing with the title for the eye. */
  .stackrow { display: flex; align-items: center; gap: var(--space-lg); }
  .stackrow .plot { flex: 1 1 auto; min-width: 0; }
  /* Width set inline per-instance (`stackPlot.legendRem`, same formula the line chart's own
     label gutter uses) — sized to THIS chart's own longest label, not a shared constant big
     enough for the worst case across every stack viz, which left a dead-space gap on charts
     with short labels. `flex-grow`/`flex-shrink` still pinned to 0 so it doesn't stretch or
     compress with the plot. */
  .legend { flex: 0 0 auto; display: flex; flex-direction: column; gap: .6rem; }
  .legenditem {
    display: inline-flex; align-items: center; gap: .45rem;
    font-size: 0.78rem; color: var(--muted-foreground); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .legenditem i { width: .65rem; height: .65rem; border-radius: 2px; flex: none; }

  /* Segments positioned absolutely within the column (`bottom`/`height`, both percentages of
     the tallest total) — see the `stackPlot` derivation for why not flex stacking order. */
  .stackbar { position: relative; width: 100%; height: 100%; }
  .stackseg { position: absolute; left: 0; right: 0; min-height: 1px; }
  .col:hover .stackseg { filter: brightness(1.15); }

  /* A styled hover card instead of the browser's native `title` tooltip — the OS-drawn box
     (plain background, ~1s delay before it appears) reads as broken next to a chart otherwise
     styled with the app's own tokens. Pure CSS `:hover`, no added interactivity/state; anchored
     above the bar, matching the .tick/.lineend precedent of overflowing a narrow column rather
     than being clipped to it (nothing up the ancestor chain sets `overflow: hidden`). */
  .stacktip {
    position: absolute; left: 50%; bottom: calc(100% + .5rem);
    transform: translateX(-50%) translateY(4px);
    background: var(--card); color: var(--card-foreground);
    border: 1px solid var(--border); border-radius: .5rem;
    padding: .5rem .65rem; box-shadow: 0 8px 20px oklch(0 0 0 / 0.16);
    white-space: nowrap; z-index: 5;
    opacity: 0; visibility: hidden; pointer-events: none;
    transition: opacity .12s ease, transform .12s ease;
  }
  .stackbar:hover .stacktip { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
  .tipyear {
    margin: 0 0 .3rem; font-size: 0.72rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .tiprow {
    display: flex; align-items: center; gap: .4rem; margin: 0; padding: .08rem 0;
    font-size: 0.72rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums;
  }
  .tiprow i { width: .5rem; height: .5rem; border-radius: 2px; flex: none; }

  /* Grid rather than flex: the three columns must align across every row, and a label
     column sized to its longest entry (`max-content`, capped) is what keeps the tracks
     starting at the same x — the thing that makes a ranking readable at a glance. */
  .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
  .bars li {
    display: grid; grid-template-columns: minmax(0, min(14rem, 32%)) 1fr auto;
    align-items: center; gap: var(--space-md);
  }
  .blabel {
    font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .track { background: var(--muted); border-radius: 999px; height: .7rem; overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--chart-1); border-radius: 999px; }
  .bars li:hover .fill { background: var(--primary); }
  .bval { font-size: 0.8rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }

  /* Same label/track shell as `.bars`, swapping the length-encoded `.track`/`.fill` for a
     zoomed-scale dot — see the `dotPlot` derivation for why. No trailing value column like
     `.bars` has: the value renders as `.dotval`, right at the dot it belongs to, rather than
     in a column whose own horizontal position bears no relation to where the dot sits.
     `.dots-axis` is a footer row using the identical grid so its ticks land under the same
     track column the rows above use. */
  .dots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .6rem; }
  .dots li, .dots-axis {
    display: grid; grid-template-columns: minmax(0, min(14rem, 32%)) 1fr;
    align-items: center; gap: var(--space-md);
  }
  .dots-axis { margin-top: .3rem; }
  .dot-track { position: relative; height: .8rem; }
  .dotgrid {
    position: absolute; top: 0; bottom: 0; width: 1px; transform: translateX(-.5px);
    background: color-mix(in oklch, var(--border) 70%, transparent);
  }
  .dottick {
    position: absolute; top: .3rem; transform: translateX(-50%);
    font-size: 0.65rem; color: var(--muted-foreground); white-space: nowrap;
  }
  /* The stem: a plain neutral tether from the track's left edge to the dot, left of `.dotmark`
     in source order so the dot's own stacking context sits visually on top of it. */
  .dotstem {
    position: absolute; left: 0; top: 50%; height: 2px; transform: translateY(-50%);
    background: color-mix(in oklch, var(--border) 85%, transparent);
  }
  /* Color is inline per-row (the value ramp) — only size/shape/position live here. */
  .dotmark {
    position: absolute; top: 50%; width: .65rem; height: .65rem; border-radius: 999px;
    transform: translate(-50%, -50%); box-shadow: 0 0 0 2px var(--card);
  }
  .dots li:hover .dotmark { outline: 2px solid var(--primary); outline-offset: 1px; }
  /* To the right of the dot, colored to match it — same idea as the line chart's end labels:
     the number sits where the value actually is, not off in a detached column. */
  .dotval {
    position: absolute; top: 50%; transform: translate(.6rem, -50%);
    font-size: 0.72rem; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums;
  }

  /* The plotting box, right of the y-axis gutter `.grid`/`.gval` already reserve. `right` is
     set inline per-viz (`linePlot.gutterRem`), sized to the longest series label — direct
     end-of-line labeling conventionally reserves dedicated margin so labels don't sit on top
     of the plotted lines/gridlines, rather than trying to fit them inside the plot itself.
     The SVG polyline and every label (end-of-line, x-ticks) share this one coordinate box so
     they can never drift apart from each other. */
  .linearea { position: absolute; left: 3.2rem; top: 0; bottom: 0; }
  .linesvg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .linesvg .lineseries { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .linesvg .lineseriesfill { opacity: 0.16; stroke: none; }

  .lineend {
    position: absolute; transform: translateY(-50%); margin-left: .5rem;
    font-size: 0.72rem; font-weight: 600; white-space: nowrap;
  }

  /* Positioned like `.tick` reads (small, muted, below the plot) but by percentage rather
     than as a flex child, since a line chart has no per-column slot to sit under. */
  .linetick {
    position: absolute; bottom: -1.3rem; transform: translateX(-50%);
    font-size: 0.65rem; color: var(--muted-foreground); white-space: nowrap;
  }

  /* Whisker + dot live in their own full-height box within the column — same reasoning as
     `.stackbar`: percentages on the children (`bottom`/`height`) need a box whose own height
     IS the plot's, not the column's post-flex-layout content height. */
  .rangebar { position: relative; width: 100%; height: 100%; }
  .rangewhisker {
    position: absolute; left: 50%; width: 2px; transform: translateX(-50%);
    background: var(--chart-1); border-radius: 1px;
  }
  /* T-caps at each end — a bare vertical line reads as "this bar is thin," not "this band has
     defined edges at these two values." */
  .rangewhisker::before,
  .rangewhisker::after {
    content: ''; position: absolute; left: 50%; width: .6rem; height: 2px;
    background: var(--chart-1); transform: translateX(-50%);
  }
  .rangewhisker::before { top: 0; }
  .rangewhisker::after { bottom: 0; }
  .rangedot {
    position: absolute; left: 50%; width: .55rem; height: .55rem; border-radius: 999px;
    background: var(--primary); transform: translate(-50%, 50%);
    box-shadow: 0 0 0 2px var(--card);
  }
  /* The median value, above the dot — the whisker's own ends aren't labelled (that's what the
     y-axis gridlines are for), but the number the dot marks is worth stating outright. */
  .rangeval {
    position: absolute; left: 50%; transform: translate(-50%, calc(-100% - .4rem));
    font-size: 0.65rem; font-weight: 600; color: var(--foreground);
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }

  /* No `.plot`/`.grid`/`.gval` y-axis here — a ridgeline's y-axis is "density," which has no
     meaningful absolute number to show (only relative height, lane to lane, means anything).
     `.ridgewrap` needs its own `position: relative` since `.ridgelabels`/`.ridgearea-wrap`
     both anchor to it, not to the shared `.plot` box every other kind uses. */
  .ridgewrap { position: relative; }
  .ridgelabels { position: absolute; left: 0; top: 0; bottom: 0; }
  .ridgelabel {
    position: absolute; left: 0; right: .6rem; transform: translateY(-50%);
    font-size: 0.72rem; color: var(--muted-foreground); text-align: right;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ridgearea-wrap { position: absolute; top: 0; bottom: 0; right: 0; }
  .ridgesvg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  /* Semi-transparent fill, drawn back-to-front (`viz.lanes`' own order — see the `ridgePlot`
     derivation) so a nearer lane's peak visibly sits IN FRONT of the ones behind it, the
     classic ridgeline look, rather than everything just piling into one indistinct mass. */
  .ridgearea { fill: color-mix(in oklch, var(--chart-1) 30%, transparent); stroke: none; }
  .ridgeline { fill: none; stroke: var(--chart-1); stroke-width: 1.1; stroke-linejoin: round; }
  /* Where the median actually sits, marked on the curve itself. */
  .ridgemedian { stroke: white; stroke-width: 1.5; }
  .ridgetick {
    position: absolute; bottom: -1.3rem; transform: translateX(-50%);
    font-size: 0.65rem; color: var(--muted-foreground); white-space: nowrap;
  }
</style>
