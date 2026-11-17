<script lang="ts">
  /**
   * One of the four top-10 game charts (spec: Games):
   *   checkouts: bars by checkouts;
   *   demand:    bars on a fixed 0–100% scale, the share of open time with every copy out;
   *   steam:     dumbbell, checkouts in the 3 h before (hollow) to the last 3 h (filled);
   *   time:      median time out (dot) with the middle half of checkouts (band).
   * LayerChart draws the axes and scales; the dumbbell and the band are marks on its scales.
   */
  import { BarChart } from 'layerchart';
  import type { BggconGame } from '$lib/server/warehouse/types';

  type Kind = 'checkouts' | 'demand' | 'steam' | 'time';
  let { games, kind, narrow }: { games: BggconGame[]; kind: Kind; narrow: boolean } = $props();

  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const share = (g: BggconGame) => (g.minutes_all_out ?? 0) / Math.max(1, g.open_minutes);
  const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`);

  const RANK: Record<Kind, { keep: (g: BggconGame) => boolean; by: (g: BggconGame) => number }> = {
    checkouts: { keep: (g) => g.checkouts > 0, by: (g) => g.checkouts },
    demand: { keep: (g) => g.copies != null && g.open_minutes > 0, by: share },
    steam: { keep: (g) => g.checkouts_last_3h > g.checkouts_prev_3h, by: (g) => g.checkouts_last_3h - g.checkouts_prev_3h },
    time: { keep: (g) => g.time_out_median != null, by: (g) => g.time_out_median ?? 0 }
  };

  const rows = $derived(
    games
      .filter(RANK[kind].keep)
      .sort((a, b) => RANK[kind].by(b) - RANK[kind].by(a))
      .slice(0, 10)
      .map((g) => ({
        ...g,
        label: short(g.name ?? `#${g.bgg_id}`, narrow ? 18 : 28) + (kind === 'demand' ? ` · ${g.copies}` : ''),
        share: share(g)
      }))
  );

  const x = $derived(
    kind === 'checkouts' ? 'checkouts' : kind === 'demand' ? 'share' : kind === 'steam' ? 'checkouts_last_3h' : 'time_out_q3'
  );
  const xDomain = $derived<[number, number] | undefined>(kind === 'demand' ? [0, 1] : undefined);
  const xFormat = $derived(
    kind === 'demand' ? (v: number) => `${Math.round(v * 100)}%` : kind === 'time' ? (v: number) => duration(v) : (v: number) => String(v)
  );
  const custom = $derived(kind === 'steam' || kind === 'time');
</script>

{#if rows.length}
  <div class="chart-area" style="--chart-h: {rows.length * 1.6 + 2.5}rem">
    <BarChart
      data={rows}
      y="label"
      {x}
      {xDomain}
      orientation="horizontal"
      bandPadding={0.35}
      padding={{ left: narrow ? 120 : 190, bottom: 24, right: 12 }}
      series={[{ key: x, label: kind === 'demand' ? 'All out' : kind === 'time' ? 'Time out' : 'Checkouts', color: 'var(--chart-1)' }]}
      props={{ xAxis: { format: xFormat, ticks: 4 } }}
    >
      {#snippet marks({ context })}
        {#each rows as r (r.bgg_id)}
          {@const y = context.yScale(r.label) + (context.yScale.bandwidth?.() ?? 0) / 2}
          {@const h = context.yScale.bandwidth?.() ?? 0}
          {#if !custom}
            <rect x={context.xScale(0)} y={y - h / 2} width={Math.max(0, context.xScale(kind === 'demand' ? r.share : r.checkouts) - context.xScale(0))} height={h} rx="3" fill="var(--chart-1)" />
          {:else if kind === 'steam'}
            <line x1={context.xScale(r.checkouts_prev_3h)} x2={context.xScale(r.checkouts_last_3h)} y1={y} y2={y} stroke="var(--muted-foreground)" stroke-width="2" />
            <circle cx={context.xScale(r.checkouts_prev_3h)} cy={y} r="4.5" fill="var(--card)" stroke="var(--muted-foreground)" stroke-width="2" />
            <circle cx={context.xScale(r.checkouts_last_3h)} cy={y} r="5" fill="var(--color-positive, var(--chart-3))" />
          {:else}
            <rect x={context.xScale(r.time_out_q1 ?? 0)} y={y - 3} width={Math.max(0, context.xScale(r.time_out_q3 ?? 0) - context.xScale(r.time_out_q1 ?? 0))} height="6" rx="3" fill="var(--chart-1)" opacity="0.3" />
            <circle cx={context.xScale(r.time_out_median ?? 0)} cy={y} r="5" fill="var(--chart-1)" stroke="var(--card)" stroke-width="2" />
          {/if}
        {/each}
      {/snippet}
    </BarChart>
  </div>
  {#if kind === 'steam'}
    <p class="legend"><span class="k hollow"></span>3 h before <span class="k filled"></span>last 3 h</p>
  {:else if kind === 'time'}
    <p class="legend"><span class="k dot"></span>typical (median) <span class="k band"></span>middle half of checkouts</p>
  {/if}
{:else}
  <p class="dim">Nothing to rank yet.</p>
{/if}

<style>
  .dim { color: var(--muted-foreground); font-size: 0.8rem; }
  .legend { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin: 0.4rem 0 0; font-size: 0.75rem; color: var(--muted-foreground); }
  .k { display: inline-block; width: 0.65rem; height: 0.65rem; border-radius: 50%; margin-left: 0.5rem; }
  .k:first-child { margin-left: 0; }
  .hollow { border: 2px solid var(--muted-foreground); box-sizing: border-box; }
  .filled { background: var(--color-positive, var(--chart-3)); }
  .dot { background: var(--chart-1); }
  .band { background: var(--chart-1); opacity: 0.3; border-radius: 999px; height: 0.35rem; }
</style>
