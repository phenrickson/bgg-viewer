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
      rows: viz.bars.map((b) => ({ ...b, pct: pct(b.value) }))
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

    // Cycles through the app's 5 categorical tokens — a 6th series would repeat a color,
    // which every current viz avoids by construction (nothing asks for more than 5 series).
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
        color: `var(--chart-${(i % 5) + 1})`,
        endLeft: last?.x ?? 0,
        endTop: last?.y ?? 0
      };
    });

    return { gridlines, xticks, lines };
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
      xTicks={ticks.x}
      yTicks={ticks.y}
      xLog={viz.xLog ?? false}
      yLog={viz.yLog ?? false}
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
          <span class="gval">{g.v.toLocaleString()}</span>
        </div>
      {/each}

      <div class="linearea" role="img" aria-label="{viz.yLabel} by {viz.xLabel}">
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
          <span class="lineend" style="left: {s.endLeft}%; top: {s.endTop}%; color: {s.color}">{s.label}</span>
        {/each}

        {#each linePlot.xticks as t (t.x)}
          <span class="linetick" style="left: {t.pct}%">{t.x}</span>
        {/each}
      </div>
    </div>
  {:else if viz.kind === 'bars' && viz.style === 'dots' && dotPlot}
    <div class="dotswrap" aria-label="{viz.yLabel} by {viz.xLabel}">
      <div class="dots-axis">
        <span></span>
        <span class="dot-track">
          {#each dotPlot.ticks as t (t.v)}
            <span class="dotgrid" style="left: {t.pct}%"></span>
            <span class="dottick" style="left: {t.pct}%">{t.v}</span>
          {/each}
        </span>
        <span></span>
      </div>
      <ul class="dots">
        {#each dotPlot.rows as b (b.label)}
          <li>
            <span class="blabel" title={b.label}>{b.label}</span>
            <span class="dot-track">
              {#each dotPlot.ticks as t (t.v)}
                <span class="dotgrid" style="left: {t.pct}%"></span>
              {/each}
              <span class="dotmark" style="left: {b.pct}%"></span>
            </span>
            <span class="bval">{b.value.toLocaleString()}</span>
          </li>
        {/each}
      </ul>
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

  /* Same grid/label/value shell as `.bars`, swapping the length-encoded `.track`/`.fill` for a
     zoomed-scale dot — see the `dotPlot` derivation for why. `.dots-axis` is a header row using
     the identical grid so its tick labels land directly above the track column beneath them. */
  .dots { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .6rem; }
  .dots li, .dots-axis {
    display: grid; grid-template-columns: minmax(0, min(14rem, 32%)) 1fr auto;
    align-items: center; gap: var(--space-md);
  }
  .dots-axis { margin-bottom: .5rem; }
  .dot-track { position: relative; height: .8rem; }
  .dotgrid {
    position: absolute; top: 0; bottom: 0; width: 1px; transform: translateX(-.5px);
    background: color-mix(in oklch, var(--border) 70%, transparent);
  }
  .dottick {
    position: absolute; top: -.1rem; transform: translateX(-50%);
    font-size: 0.65rem; color: var(--muted-foreground); white-space: nowrap;
  }
  .dotmark {
    position: absolute; top: 50%; width: .6rem; height: .6rem; border-radius: 999px;
    background: var(--chart-1); transform: translate(-50%, -50%);
  }
  .dots li:hover .dotmark { background: var(--primary); }

  /* The plotting box, right of the y-axis gutter `.grid`/`.gval` already reserve — the SVG
     polyline and every label (end-of-line, x-ticks) share this one coordinate box so they
     can never drift apart from each other. */
  /* `right: 10rem` (not 0) reserves room for direct end-of-line labels — the standard fix for
     labels that sit at a line's rightmost point, which is always the plot's own right edge
     here. Without it, "Solo / Solitaire Game" ran straight off the section. */
  .linearea { position: absolute; left: 3.2rem; right: 10rem; top: 0; bottom: 0; }
  .linesvg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .linesvg .lineseries { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .linesvg .lineseriesfill { opacity: 0.16; stroke: none; }

  .lineend {
    position: absolute; transform: translateY(-50%); margin-left: .4rem;
    font-size: 0.72rem; font-weight: 600; white-space: nowrap;
  }

  /* Positioned like `.tick` reads (small, muted, below the plot) but by percentage rather
     than as a flex child, since a line chart has no per-column slot to sit under. */
  .linetick {
    position: absolute; bottom: -1.3rem; transform: translateX(-50%);
    font-size: 0.65rem; color: var(--muted-foreground); white-space: nowrap;
  }
</style>
