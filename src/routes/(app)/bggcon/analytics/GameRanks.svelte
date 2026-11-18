<script lang="ts">
  /**
   * One of the four top-10 game charts (spec: Games):
   *   checkouts: bars by checkouts;
   *   demand:    bars on a fixed 0–100% scale, the share of open time with every copy out;
   *   steam:     dumbbell, checkouts in the 3 h before (hollow) to the last 3 h (filled);
   *   time:      median time out (dot) with the middle half of checkouts (band).
   * LayerChart draws the axes and scales; the dumbbell and the band are marks on its scales.
   * The legends live in the card header (AnalyticsView), so every chart area is the same size.
   */
  import { BarChart, Tooltip } from 'layerchart';
  import { topGames, type GameKind, type RankedGame } from '$lib/bggcon/analytics';
  import type { BggconGame } from '$lib/server/warehouse/types';

  let { games, kind, narrow }: { games: BggconGame[]; kind: GameKind; narrow: boolean } = $props();

  /** Long form, for the tooltip: "45 min", "1 h 05". */
  const duration = (m: number) => {
    const r = Math.round(m);
    return r >= 60 ? `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}` : `${r} min`;
  };
  /** Short form, for axis ticks: "45m", "1h", "1h30". */
  const durationTick = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`);

  const rows = $derived(topGames(games, kind, narrow ? 18 : 28));
  const labelOf = $derived(new Map(rows.map((r) => [r.key, r.label])));

  const x = $derived(
    kind === 'checkouts' ? 'checkouts' : kind === 'demand' ? 'share' : kind === 'steam' ? 'checkouts_last_3h' : 'time_out_q3'
  );
  const xDomain = $derived<[number, number] | undefined>(kind === 'demand' ? [0, 1] : undefined);
  const xFormat = $derived(
    kind === 'demand' ? (v: number) => `${Math.round(v * 100)}%` : kind === 'time' ? durationTick : (v: number) => String(v)
  );

  /**
   * At most ~4 ticks, shared by the axis and the grid so every grid line has a label.
   * Durations step on clock-friendly minutes; counts step on whole numbers.
   */
  const ticks = $derived.by(() => {
    if (kind === 'demand') return [0, 0.5, 1];
    const max =
      kind === 'time'
        ? Math.max(0, ...rows.map((r) => r.time_out_q3 ?? 0))
        : Math.max(0, ...rows.map((r) => (kind === 'steam' ? r.checkouts_last_3h : r.checkouts)));
    const steps = kind === 'time' ? [15, 30, 60, 120, 180, 240, 360] : [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const step = steps.find((s) => max / s <= 3) ?? steps[steps.length - 1];
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  });

  const custom = $derived(kind === 'steam' || kind === 'time');
</script>

{#snippet item(label: string, value: string)}
  <Tooltip.Item {label} {value} valueAlign="right" />
{/snippet}

{#if rows.length}
  <div class="chart-area" style="--chart-h: {rows.length * 1.6 + 2.5}rem">
    <BarChart
      data={rows}
      y="key"
      {x}
      {xDomain}
      orientation="horizontal"
      bandPadding={0.35}
      padding={{ left: narrow ? 120 : 190, bottom: 24, right: 16 }}
      series={[{ key: x, label: kind === 'demand' ? 'All out' : kind === 'time' ? 'Time out' : 'Checkouts', color: 'var(--chart-1)' }]}
      props={{
        xAxis: { format: xFormat, ticks, tickMarks: false },
        yAxis: { format: (k: string) => labelOf.get(k) ?? k, tickMarks: false },
        grid: { xTicks: ticks }
      }}
    >
      {#snippet marks({ context })}
        {#each rows as r (r.bgg_id)}
          {@const y = context.yScale(r.key) + (context.yScale.bandwidth?.() ?? 0) / 2}
          {@const h = context.yScale.bandwidth?.() ?? 0}
          {#if !custom}
            <rect x={context.xScale(0)} y={y - h / 2} width={Math.max(0, context.xScale(kind === 'demand' ? r.share : r.checkouts) - context.xScale(0))} height={h} rx="3" fill="var(--chart-1)" />
          {:else if kind === 'steam'}
            <line x1={context.xScale(r.checkouts_prev_3h)} x2={context.xScale(r.checkouts_last_3h)} y1={y} y2={y} stroke="var(--muted-foreground)" stroke-width="2" />
            <circle cx={context.xScale(r.checkouts_prev_3h)} cy={y} r="4.5" fill="var(--card)" stroke="var(--muted-foreground)" stroke-width="2" />
            <circle cx={context.xScale(r.checkouts_last_3h)} cy={y} r="5" fill="var(--chart-1)" stroke="var(--card)" stroke-width="2" />
          {:else}
            <rect x={context.xScale(r.time_out_q1 ?? 0)} y={y - 3} width={Math.max(0, context.xScale(r.time_out_q3 ?? 0) - context.xScale(r.time_out_q1 ?? 0))} height="6" rx="3" fill="var(--chart-1)" opacity="0.3" />
            <circle cx={context.xScale(r.time_out_median ?? 0)} cy={y} r="5" fill="var(--chart-1)" stroke="var(--card)" stroke-width="2" />
          {/if}
        {/each}
      {/snippet}

      {#snippet tooltip({ context })}
        <Tooltip.Root {context}>
          {#snippet children({ data })}
            {@const g = data as RankedGame}
            <Tooltip.Header value={g.name ?? `#${g.bgg_id}`} />
            <Tooltip.List>
              {#if kind === 'checkouts'}
                {@render item('Checkouts', g.checkouts.toLocaleString())}
              {:else if kind === 'demand'}
                {@render item('All copies out', `${Math.round(g.share * 100)}% of open time`)}
                {@render item('Copies', String(g.copies ?? '—'))}
              {:else if kind === 'steam'}
                {@render item('Last 3 h', String(g.checkouts_last_3h))}
                {@render item('3 h before', String(g.checkouts_prev_3h))}
              {:else}
                {@render item('Typical', duration(g.time_out_median ?? 0))}
                {@render item('Middle half', `${duration(g.time_out_q1 ?? 0)} – ${duration(g.time_out_q3 ?? 0)}`)}
                {@render item('Checkouts', g.checkouts.toLocaleString())}
              {/if}
            </Tooltip.List>
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </BarChart>
  </div>
{:else}
  <p class="dim">Nothing to rank yet.</p>
{/if}

<style>
  .dim { color: var(--muted-foreground); font-size: 0.8rem; }
</style>
