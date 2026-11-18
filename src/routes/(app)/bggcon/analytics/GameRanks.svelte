<script lang="ts">
  /**
   * One of the four top-10 game charts (spec: Games):
   *   checkouts: bars by checkouts;
   *   demand:    bars on a fixed 0–100% scale, the share of open time with every copy out;
   *   steam:     dumbbell, checkouts in the 3 h before (hollow) to the last 3 h (filled);
   *   time:      median time out (dot) with the middle half of checkouts (band).
   * LayerChart draws the axes and scales; the bars, dumbbell and band are marks on its scales.
   * The legend sits under the chart area, outside its fixed height, so a chart with a legend
   * plots exactly like its neighbours.
   */
  import { BarChart, Tooltip } from 'layerchart';
  import { topGames, type GameKind, type RankedGame } from '$lib/bggcon/analytics';
  import type { BggconGame } from '$lib/server/warehouse/types';
  import { tipRoot } from './tooltip';

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
  const dots = $derived(kind === 'steam' || kind === 'time');

  const x = $derived(
    kind === 'checkouts' ? 'checkouts' : kind === 'demand' ? 'share' : kind === 'steam' ? 'checkouts_last_3h' : 'time_out_q3'
  );
  const max = $derived(
    kind === 'demand'
      ? 1
      : kind === 'time'
        ? Math.max(0, ...rows.map((r) => r.time_out_q3 ?? 0))
        : Math.max(0, ...rows.map((r) => (kind === 'steam' ? r.checkouts_last_3h : r.checkouts)))
  );

  /**
   * At most ~4 ticks, shared by the axis and the grid so every grid line has a label.
   * Durations step on clock-friendly minutes; counts on whole numbers.
   */
  const ticks = $derived.by(() => {
    if (kind === 'demand') return [0, 0.5, 1];
    const steps = kind === 'time' ? [15, 30, 60, 120, 180, 240, 360] : [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const step = steps.find((s) => max / s <= 3) ?? steps[steps.length - 1];
    // At least one step, so an all-zero chart still has a scale rather than a 0–0 domain.
    return Array.from({ length: Math.max(1, Math.ceil(max / step)) + 1 }, (_, i) => i * step);
  });
  const top = $derived(ticks[ticks.length - 1] ?? max);

  /** Bars grow from 0. Dots get a little air at both ends so one at 0 or at the top isn't cut in half. */
  const xDomain = $derived<[number, number]>(dots ? [-top * 0.04, top * 1.04] : [0, top]);
  const xFormat = $derived(
    kind === 'demand' ? (v: number) => `${Math.round(v * 100)}%` : kind === 'time' ? durationTick : (v: number) => String(v)
  );

  /** A bar with a 4px rounded data end and a square end on the baseline. */
  function barPath(x0: number, x1: number, y: number, h: number) {
    const w = Math.max(0, x1 - x0);
    const r = Math.min(4, w, h / 2);
    return `M${x0},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
  }
</script>

{#snippet item(name: string, value: string, key?: 'hollow' | 'dot' | 'band')}
  <Tooltip.Item {value} valueAlign="right">
    {#snippet label()}
      <span class="tip-label">{#if key}<span class="tip-key {key}"></span>{/if}{name}</span>
    {/snippet}
  </Tooltip.Item>
{/snippet}

{#if rows.length}
  <div class="chart-area ranks" style="--chart-h: {rows.length * 1.75 + 2}rem">
    <BarChart
      data={rows}
      y="key"
      {x}
      {xDomain}
      orientation="horizontal"
      bandPadding={0.4}
      padding={{ left: narrow ? 124 : 196, bottom: 22, right: 14, top: 2 }}
      rule={!dots}
      series={[{ key: x, label: kind === 'demand' ? 'All out' : kind === 'time' ? 'Time out' : 'Checkouts', color: 'var(--chart-1)' }]}
      props={{
        xAxis: { format: xFormat, ticks, tickMarks: false },
        yAxis: { format: (k: string) => labelOf.get(k) ?? k, tickMarks: false, tickLabelProps: { dx: -6 } },
        grid: { xTicks: ticks }
      }}
    >
      {#snippet marks({ context })}
        {#each rows as r (r.bgg_id)}
          {@const h = Math.min(18, context.yScale.bandwidth?.() ?? 0)}
          {@const y = context.yScale(r.key) + (context.yScale.bandwidth?.() ?? 0) / 2}
          {#if kind === 'checkouts' || kind === 'demand'}
            <path d={barPath(context.xScale(0), context.xScale(kind === 'demand' ? r.share : r.checkouts), y - h / 2, h)} fill="var(--chart-1)" />
          {:else if kind === 'steam'}
            <line x1={context.xScale(r.checkouts_prev_3h)} x2={context.xScale(r.checkouts_last_3h)} y1={y} y2={y} stroke="var(--muted-foreground)" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round" />
            <circle cx={context.xScale(r.checkouts_prev_3h)} cy={y} r="4.5" fill="var(--card)" stroke="var(--muted-foreground)" stroke-width="2" />
            <circle cx={context.xScale(r.checkouts_last_3h)} cy={y} r="5" fill="var(--chart-1)" stroke="var(--card)" stroke-width="2" />
          {:else}
            <rect x={context.xScale(r.time_out_q1 ?? 0)} y={y - 3} width={Math.max(0, context.xScale(r.time_out_q3 ?? 0) - context.xScale(r.time_out_q1 ?? 0))} height="6" rx="3" fill="var(--chart-1)" opacity="0.3" />
            <circle cx={context.xScale(r.time_out_median ?? 0)} cy={y} r="5" fill="var(--chart-1)" stroke="var(--card)" stroke-width="2" />
          {/if}
        {/each}
      {/snippet}

      {#snippet tooltip({ context })}
        <Tooltip.Root {context} {...tipRoot}>
          {#snippet children({ data })}
            {@const g = data as RankedGame}
            <Tooltip.Header value={g.name ?? `#${g.bgg_id}`} />
            <Tooltip.List>
              {#if kind === 'checkouts'}
                {@render item('Checkouts', g.checkouts.toLocaleString())}
              {:else if kind === 'demand'}
                {@render item('Every copy out', `${Math.round(g.share * 100)}% of open time`)}
                {@render item('Copies', String(g.copies ?? '—'))}
                {@render item('Checkouts', g.checkouts.toLocaleString())}
              {:else if kind === 'steam'}
                {@render item('Last 3 h', String(g.checkouts_last_3h), 'dot')}
                {@render item('3 h before', String(g.checkouts_prev_3h), 'hollow')}
              {:else}
                {@render item('Typical', duration(g.time_out_median ?? 0), 'dot')}
                {@render item('Middle half', `${duration(g.time_out_q1 ?? 0)} – ${duration(g.time_out_q3 ?? 0)}`, 'band')}
                {@render item('Checkouts', g.checkouts.toLocaleString())}
              {/if}
            </Tooltip.List>
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </BarChart>
  </div>
  {#if kind === 'steam'}
    <p class="legend"><span><span class="tip-key hollow"></span>3 h before</span><span><span class="tip-key dot"></span>last 3 h</span></p>
  {:else if kind === 'time'}
    <p class="legend"><span><span class="tip-key dot"></span>typical (median)</span><span><span class="tip-key band"></span>middle half of checkouts</span></p>
  {/if}
{:else}
  <p class="dim">Nothing to rank yet.</p>
{/if}

<style>
  .dim { color: var(--muted-foreground); font-size: 0.8rem; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--muted-foreground); }
  .legend > span, .tip-label { display: inline-flex; align-items: center; gap: 0.4rem; }
  /* Keys mirror the marks they stand for. */
  .tip-key { display: inline-block; flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; }
  .tip-key.dot { background: var(--chart-1); }
  .tip-key.hollow { border: 2px solid var(--muted-foreground); }
  .tip-key.band { width: 0.9rem; height: 0.35rem; border-radius: 999px; background: color-mix(in oklab, var(--chart-1) 30%, transparent); }
</style>
