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
  import type { BggconActivity } from '$lib/server/warehouse/types';

  let { activity }: { activity: BggconActivity } = $props();

  // Color follows the day, in a fixed order, never its rank.
  const DAY_COLORS: Record<string, string> = {
    Wed: 'var(--chart-1)',
    Thu: 'var(--chart-2)',
    Fri: 'var(--chart-3)',
    Sat: 'var(--chart-4)',
    Sun: 'var(--chart-5)'
  };
  const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'AM' : 'PM'}`;
  const axisTicks = HOURS.filter((h) => h % 3 === 2).map(hourLabel); // 8AM, 11AM, 2PM, …

  const avg = $derived(averageByHour(activity).map((d) => ({ hour: hourLabel(d.hour), average: Math.round(d.average * 10) / 10 })));
  const days = $derived(eachDay(activity));
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
  const totals = $derived(byDay(activity).map((d) => ({ day: d.day, checkouts: d.checkouts ?? 0, partial: d.partial, toCome: d.checkouts === null })));
</script>

<AutoGrid min="md">
  <Card.Root size="sm">
    <Card.Header><Card.Title>By time of day</Card.Title><Card.Description>average checkouts per hour, Wed on</Card.Description></Card.Header>
    <Card.Content>
      <div class="chart-area" style="--chart-h: 12rem">
        <BarChart data={avg} x="hour" y="average" series={[{ key: 'average', label: 'Average', color: 'var(--chart-1)' }]} props={{ xAxis: { ticks: axisTicks } }} />
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root size="sm">
    <Card.Header><Card.Title>Each day</Card.Title><Card.Description>checkouts per hour</Card.Description></Card.Header>
    <Card.Content>
      <div class="chart-area" style="--chart-h: 12rem">
        {#if daySeries.length}
          <LineChart
            data={lines}
            x="hour"
            series={daySeries}
            legend
            props={{ xAxis: { format: (h: number) => hourLabel(h), ticks: HOURS.filter((h) => h % 3 === 2) }, spline: { 'stroke-width': 2 } }}
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
    </Card.Content>
  </Card.Root>

  <Card.Root size="sm">
    <Card.Header><Card.Title>By day</Card.Title><Card.Description>total checkouts; today so far</Card.Description></Card.Header>
    <Card.Content>
      <div class="chart-area" style="--chart-h: 12rem">
        <BarChart data={totals} x="day" y="checkouts" series={[{ key: 'checkouts', label: 'Checkouts', color: 'var(--chart-1)' }]}>
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
      </div>
    </Card.Content>
  </Card.Root>
</AutoGrid>

<style>
  .dim { color: var(--muted-foreground); font-size: 0.8rem; }
</style>
