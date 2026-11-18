<script lang="ts">
  /**
   * The three activity charts in a row (they stack on a phone through AutoGrid):
   * average by hour, each day as a line, and totals by day. Complete hours only, so the
   * current hour never reads as a drop. PLACEHOLDER copy (Phil).
   */
  import { BarChart, LineChart } from 'layerchart';
  import * as Card from '$lib/components/ui/card';
  import { AutoGrid } from '$lib/components/ui/layout';
  import { HOURS, averageByHour, byDay, eachDay } from '$lib/bggcon/analytics';
  import { Spinner } from '$lib/components/ui/spinner';
  import type { BggconActivity } from '$lib/server/warehouse/types';
  import { tipRoot } from './tooltip';

  /** `activity` is null while it loads: each card spins in place of its chart. */
  let { activity }: { activity: BggconActivity | null } = $props();
  const EMPTY: BggconActivity = { as_of: null, hours: [], buckets: [] };
  const a = $derived(activity ?? EMPTY);

  // Color follows the day, in a fixed order, never its rank.
  const DAY_COLORS: Record<string, string> = {
    Wed: 'var(--chart-1)',
    Thu: 'var(--chart-2)',
    Fri: 'var(--chart-3)',
    Sat: 'var(--chart-4)',
    Sun: 'var(--chart-5)'
  };
  const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  const allHours = HOURS.map(hourLabel); // 8AM … 11PM, the library window
  const axisTicks = HOURS.filter((h) => h % 3 === 2).map(hourLabel); // 8AM, 11AM, 2PM, …

  const avg = $derived(averageByHour(a).map((d) => ({ hour: hourLabel(d.hour), average: Math.round(d.average * 10) / 10 })));
  const days = $derived(eachDay(a));
  const lines = $derived(
    HOURS.map((h) => ({
      hour: h,
      ...Object.fromEntries(days.map((d) => [d.day, d.points.find((p) => p.hour === h)?.checkouts ?? null]))
    }))
  );
  const daySeries = $derived(
    days
      .filter((d) => d.points.length)
      .map((d) => ({
        key: d.day,
        label: d.day,
        color: DAY_COLORS[d.day],
        // Today is drawn heavier so its short, growing line isn't lost under the others.
        props: d.today ? { 'stroke-width': 3.5 } : {}
      }))
  );
  const today = $derived(days.find((d) => d.today && d.points.length) ?? null);
  const todayEnd = $derived(today ? today.points[today.points.length - 1] : null);
  const totals = $derived(byDay(a).map((d) => ({ day: d.day, checkouts: d.checkouts ?? 0, partial: d.partial, toCome: d.checkouts === null })));
</script>

<AutoGrid min="md">
  <Card.Root size="sm">
    <Card.Header><Card.Title>By time of day</Card.Title><Card.Description>average checkouts per hour, Wed on</Card.Description></Card.Header>
    <Card.Content>
      <div class="chart-area" style="--chart-h: 12rem">
        {#if !activity}
          <div class="loading" style:height="12rem"><Spinner /></div>
        {:else if avg.length}
          <!-- Every library hour on the axis, so the day's shape keeps its place as hours fill in. -->
          <BarChart
            data={avg}
            x="hour"
            y="average"
            xDomain={allHours}
            series={[{ key: 'average', label: 'Average', color: 'var(--chart-1)' }]}
            props={{
              xAxis: { ticks: axisTicks, tickMarks: false },
              yAxis: { ticks: 4, tickMarks: false },
              tooltip: { root: tipRoot }
            }}
          />
        {:else}
          <p class="dim">No complete library hours yet.</p>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root size="sm">
    <Card.Header><Card.Title>Each day</Card.Title><Card.Description>checkouts per hour</Card.Description></Card.Header>
    <Card.Content>
      <div class="chart-area" style="--chart-h: 12rem">
        {#if !activity}
          <div class="loading" style:height="12rem"><Spinner /></div>
        {:else if daySeries.length}
          <LineChart
            data={lines}
            x="hour"
            series={daySeries}
            props={{
              xAxis: { format: (h: number) => hourLabel(h), ticks: HOURS.filter((h) => h % 3 === 2), tickMarks: false },
              yAxis: { ticks: 4, tickMarks: false },
              spline: { 'stroke-width': 2 },
              tooltip: { root: tipRoot, header: { format: (h: number) => hourLabel(h) } }
            }}
          >
            {#snippet aboveMarks({ context })}
              {#if today && todayEnd}
                {@const cx = context.xScale(todayEnd.hour)}
                {@const cy = context.yScale(todayEnd.checkouts)}
                <circle {cx} {cy} r="4.5" fill={DAY_COLORS[today.day]} stroke="var(--card)" stroke-width="2" />
                <text x={cx} y={cy + 18} text-anchor="middle" font-size="11" fill="var(--foreground)">{today.day} so far</text>
              {/if}
            {/snippet}
          </LineChart>
        {:else}
          <p class="dim">No complete library hours yet.</p>
        {/if}
      </div>
      <!-- Under the chart area, not inside it, so this plot is the same size as its neighbours'. -->
      {#if activity && daySeries.length}
        <p class="legend">
          {#each daySeries as s (s.key)}<span><span class="line-key" style:background={s.color}></span>{s.label}</span>{/each}
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root size="sm">
    <Card.Header><Card.Title>By day</Card.Title><Card.Description>total checkouts; today so far</Card.Description></Card.Header>
    <Card.Content>
      <div class="chart-area" style="--chart-h: 12rem">
        {#if !activity}
          <div class="loading" style:height="12rem"><Spinner /></div>
        {:else}
        <BarChart
          data={totals}
          x="day"
          y="checkouts"
          series={[{ key: 'checkouts', label: 'Checkouts', color: 'var(--chart-1)' }]}
          props={{ xAxis: { tickMarks: false }, yAxis: { ticks: 4, tickMarks: false }, tooltip: { root: tipRoot } }}
        >
          {#snippet aboveMarks({ context })}
            {#each totals as d (d.day)}
              {@const x = context.xScale(d.day)}
              {@const w = context.xScale.bandwidth?.() ?? 0}
              {#if d.partial}
                <rect {x} y={0} width={w} height={context.height} fill="var(--card)" opacity="0.45" />
              {:else if d.toCome}
                <rect {x} y={context.height - 6} width={w} height={6} fill="none" stroke="var(--border)" stroke-dasharray="3 2" />
              {/if}
            {/each}
          {/snippet}
        </BarChart>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</AutoGrid>

<style>
  /* Holds a card's place while its data loads, so nothing jumps when it arrives. */
  .loading { display: grid; place-items: center; }
  .dim { color: var(--muted-foreground); font-size: 0.8rem; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--muted-foreground); }
  .legend > span { display: inline-flex; align-items: center; gap: 0.4rem; }
  /* A line chart's key is a short stroke, mirroring the mark. */
  .line-key { display: inline-block; width: 0.9rem; height: 2px; border-radius: 1px; }
</style>
