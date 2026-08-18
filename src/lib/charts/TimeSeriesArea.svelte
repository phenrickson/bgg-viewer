<script lang="ts">
  /**
   * A small area chart of a count over time. Generic like MiniHistogram/MiniColumns
   * — callers do their own bucketing (how to group by time is domain-specific: this
   * page buckets by `first_seen`, another caller might bucket by something else
   * entirely), and hand this component the already-bucketed points.
   *
   * Uses layerchart's AreaChart. The default Spline/Area stroke has no explicit
   * width, so it falls back to the SVG default of 1 — a 1px diagonal stroke reads
   * as jagged/aliased with only a handful of points. curveMonotoneX + a thicker
   * line fix that; d3-shape is imported directly for the curve, matching how
   * $lib/charts/scale.ts already imports d3-scale/d3-array rather than going
   * through layerchart's re-exports (it doesn't re-export curve functions).
   */
  import { AreaChart, Area, Points } from 'layerchart';
  import { curveMonotoneX } from 'd3-shape';

  let {
    data,
    height = 90,
    color = 'var(--chart-1)'
  }: {
    data: { date: Date; count: number }[];
    height?: number;
    color?: string;
  } = $props();

  const MAX_TICKS = 8;

  /**
   * Without an explicit `ticks` array, the x-axis auto-picks "nice" evenly-spaced
   * times — for a handful of daily buckets that lands ticks at noon between day
   * boundaries instead of on them. Ticking every bucket boundary fixes that; for
   * wider windows (e.g. 52 weekly buckets over a year) that'd be too dense, so
   * decimate down to ~MAX_TICKS evenly-spaced buckets instead.
   */
  const tickDates = $derived.by(() => {
    if (data.length <= MAX_TICKS) return data.map((d) => d.date);
    const step = Math.ceil(data.length / MAX_TICKS);
    return data.filter((_, i) => i % step === 0).map((d) => d.date);
  });

  function formatDate(d: Date): string {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
</script>

<div class="timeseries-area" style:--chart-color={color} style:height="{height}px">
  <AreaChart
    {data}
    x="date"
    y="count"
    yDomain={[0, null]}
    yNice
    props={{ xAxis: { ticks: tickDates, format: formatDate }, grid: { y: false } }}
  >
    {#snippet marks({ context })}
      {#each context.series.visibleSeries as s (s.key)}
        <Area
          seriesKey={s.key}
          curve={curveMonotoneX}
          fill="var(--chart-color)"
          fillOpacity={0.2}
          line={{ curve: curveMonotoneX, stroke: 'var(--chart-color)', 'stroke-width': 2 }}
        />
        <Points seriesKey={s.key} r={3} fill="var(--chart-color)" />
      {/each}
    {/snippet}
  </AreaChart>
</div>

<style>
  .timeseries-area {
    width: 100%;
  }
</style>
