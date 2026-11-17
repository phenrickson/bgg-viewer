<script lang="ts">
  /**
   * Over the con: checkouts every 15 minutes, Tue 00:00 to Sun 1 PM Chicago, the whole range
   * always drawn so the con's shape reads as it fills in. Closed hours are shaded, "now" is
   * marked, and the current 15 minutes (still counting) is faded.
   */
  import { BarChart } from 'layerchart';
  import { chicago, isOpen } from '$lib/bggcon/analytics';
  import type { BggconActivity } from '$lib/server/warehouse/types';

  let { activity }: { activity: BggconActivity } = $props();

  const STEP = 15 * 60 * 1000;
  const START = Date.parse('2026-11-17T06:00:00Z'); // Tue 00:00 Chicago
  const END = Date.parse('2026-11-22T19:00:00Z'); // Sun 1 PM Chicago

  const counts = $derived(new Map(activity.buckets.map((b) => [Date.parse(b.start), b.checkouts])));
  const asOf = $derived(activity.as_of ? Date.parse(activity.as_of) : null);
  const data = $derived(
    Array.from({ length: (END - START) / STEP }, (_, i) => {
      const t = START + i * STEP;
      return { t: new Date(t), checkouts: counts.get(t) ?? 0 };
    })
  );
  const dayStarts = $derived(data.filter((d) => chicago(d.t.toISOString()).hour === 0 && d.t.getUTCMinutes() === 0).map((d) => d.t));
  const closed = $derived(data.filter((d) => !isOpen(activity, d.t.toISOString())).map((d) => d.t));
  const current = $derived(asOf === null ? null : data.find((d) => d.t.getTime() <= asOf && asOf < d.t.getTime() + STEP)?.t ?? null);
  const label = (t: Date) => {
    const c = chicago(t.toISOString());
    return `${c.day} ${c.hour % 12 || 12}:${String(c.minute).padStart(2, '0')} ${c.hour < 12 ? 'AM' : 'PM'}`;
  };
</script>

<div class="chart-area" style="--chart-h: 13rem">
  <BarChart
    {data}
    x="t"
    y="checkouts"
    bandPadding={0.1}
    series={[{ key: 'checkouts', label: 'Checkouts', color: 'var(--chart-2)' }]}
    props={{
      xAxis: { ticks: dayStarts, format: (t: Date) => chicago(t.toISOString()).day },
      yAxis: { format: (v: number) => String(v) },
      tooltip: { header: { format: (t: Date) => label(t) } }
    }}
  >
    {#snippet belowMarks({ context })}
      {@const bw = context.xScale.bandwidth?.() ?? 0}
      {#each closed as t (t.getTime())}
        <rect x={context.xScale(t)} y={0} width={bw / 0.9} height={context.height} fill="var(--muted)" />
      {/each}
    {/snippet}
    {#snippet aboveMarks({ context })}
      {#if current}
        {@const x = context.xScale(current) + (context.xScale.bandwidth?.() ?? 0)}
        <rect x={context.xScale(current)} y={0} width={context.xScale.bandwidth?.() ?? 0} height={context.height} fill="var(--card)" opacity="0.55" />
        <line x1={x} x2={x} y1={0} y2={context.height} stroke="var(--foreground)" stroke-opacity="0.6" stroke-dasharray="3 3" />
        <text {x} dx="4" y="10" font-size="11" fill="var(--muted-foreground)">now</text>
      {/if}
    {/snippet}
  </BarChart>
</div>
