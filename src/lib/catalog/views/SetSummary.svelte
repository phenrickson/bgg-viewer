<script lang="ts">
  /**
   * Distributions of the scoped set — rating, complexity, games-per-year — each headlined
   * by its own summary stat (median / span) so the number reads against the shape it came
   * from. Rendered inside the Summary lens. GROUP BY over the current WHERE, in-browser.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import {
    summarySql,
    ratingHistogramSql,
    complexityHistogramSql,
    gamesPerYearSql,
    type Summary,
    type Bin,
    type YearCount
  } from '$lib/catalog/aggregates';
  import BarChart from '$lib/charts/BarChart.svelte';

  let { where }: { where: string } = $props();

  let summary = $state<Summary | null>(null);
  let ratingBins = $state<Bin[]>([]);
  let weightBins = $state<Bin[]>([]);
  let perYear = $state<YearCount[]>([]);

  let token = 0;
  $effect(() => {
    const w = where;
    const mine = ++token;
    Promise.all([
      query<Summary>(summarySql(w)),
      query<Bin>(ratingHistogramSql(w)),
      query<Bin>(complexityHistogramSql(w)),
      query<YearCount>(gamesPerYearSql(w))
    ])
      .then(([s, rb, wb, py]) => {
        if (mine !== token) return;
        summary = s[0] ?? null;
        ratingBins = rb;
        weightBins = wb;
        perYear = py;
      })
      .catch((e) => mine === token && console.error('summary aggregates failed', e));
  });

  const fmt = (n: number | null | undefined, d = 2) => (n == null ? '—' : n.toFixed(d));
  const onlyWhole = (v: number) => (Number.isInteger(v) ? String(v) : '');
  const span = $derived(
    summary?.year_min != null ? `${summary.year_min}–${summary.year_max}` : '—'
  );
</script>

<div class="row">
  <section class="panel">
    <div class="phead">
      <span class="big tnum">{fmt(summary?.median_rating)}</span>
      <span class="lab">median rating <span class="dim">· distribution</span></span>
    </div>
    <div class="body chart">
      {#if ratingBins.length}
        <BarChart data={ratingBins} x="bucket" y="n" color="var(--chart-1)" xFormat={onlyWhole} />
      {:else}<p class="empty">No rated games in scope.</p>{/if}
    </div>
  </section>

  <section class="panel">
    <div class="phead">
      <span class="big tnum">{fmt(summary?.median_weight)}</span>
      <span class="lab">median complexity <span class="dim">· weight 1–5</span></span>
    </div>
    <div class="body chart">
      {#if weightBins.length}
        <BarChart data={weightBins} x="bucket" y="n" color="var(--chart-4)" xFormat={onlyWhole} />
      {:else}<p class="empty">No weighted games in scope.</p>{/if}
    </div>
  </section>

  <section class="panel">
    <div class="phead">
      <span class="big tnum">{span}</span>
      <span class="lab">year span <span class="dim">· games per year</span></span>
    </div>
    <div class="body chart">
      {#if perYear.length}
        <BarChart data={perYear} x="year" y="n" color="var(--chart-2)" maxXTicks={8} />
      {:else}<p class="empty">No games in scope.</p>{/if}
    </div>
  </section>
</div>

<style>
  .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-md); }
  @media (max-width: 860px) { .row { grid-template-columns: 1fr; } }
  .panel { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: var(--space-md); min-width: 0; }
  .phead { margin-bottom: 0.5rem; }
  .phead .big { font-size: 1.7rem; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
  .phead .lab { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; margin-top: .1rem; }
  .phead .dim { text-transform: none; letter-spacing: 0; font-weight: 400; opacity: .8; }
  .tnum { font-variant-numeric: tabular-nums; }
  .body.chart { height: 15rem; }
  .empty { color: var(--muted-foreground); font-size: 0.82rem; text-align: center; padding: var(--space-lg) 0; }
</style>
