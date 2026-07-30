<script lang="ts">
  /**
   * Set summary — stat tiles + the numeric distributions of the scoped set (rating,
   * complexity, games per year). Every panel is a GROUP BY over the current WHERE,
   * recomputed in-browser on scope change. Composition (best-at / categories / mechanics)
   * lives in SetComposition, below the table.
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
  let loading = $state(true);

  let token = 0;
  $effect(() => {
    const w = where;
    const mine = ++token;
    loading = true;
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
        loading = false;
      })
      .catch((e) => {
        if (mine === token) {
          console.error('summary aggregates failed', e);
          loading = false;
        }
      });
  });

  let open = $state(true);
  const fmt = (n: number | null | undefined, d = 2) => (n == null ? '—' : n.toFixed(d));
  const onlyWhole = (v: number) => (Number.isInteger(v) ? String(v) : '');
  const chartYears = $derived(
    perYear.length ? `${perYear[0].year}–${perYear[perYear.length - 1].year}` : '—'
  );
</script>

<div class="tiles">
  <div class="tile"><span class="k">Median complexity</span><b class="v tnum">{fmt(summary?.median_weight)}</b></div>
  <div class="tile"><span class="k">Median geek rating</span><b class="v tnum">{fmt(summary?.median_geek)}</b></div>
  <div class="tile"><span class="k">Year span</span><b class="v tnum">{summary?.year_min ?? '—'}–{summary?.year_max ?? '—'}</b></div>
  <div class="tile"><span class="k">Upcoming / unrated</span><b class="v tnum">{(summary?.upcoming ?? 0).toLocaleString()}</b></div>
</div>

<button class="disclosure" onclick={() => (open = !open)} aria-expanded={open}>
  <span class="caret" class:open>▸</span> Set summary
  <span class="sub">· distributions & top facets{loading ? ' · updating…' : ''}</span>
</button>

<div class="panels" class:hidden={!open}>
  <!-- Row 1 — numeric distributions (vertical bars) -->
  <div class="row">
    <section class="panel">
      <header><h4>Rating distribution</h4><span class="sub">average rating</span></header>
      <div class="body chart">
        {#if ratingBins.length}
          <BarChart data={ratingBins} x="bucket" y="n" color="var(--chart-1)" xFormat={onlyWhole} />
        {:else}<p class="empty">No rated games in scope.</p>{/if}
      </div>
    </section>

    <section class="panel">
      <header><h4>Complexity distribution</h4><span class="sub">weight, 1–5</span></header>
      <div class="body chart">
        {#if weightBins.length}
          <BarChart data={weightBins} x="bucket" y="n" color="var(--chart-4)" xFormat={onlyWhole} />
        {:else}<p class="empty">No weighted games in scope.</p>{/if}
      </div>
    </section>

    <section class="panel">
      <header><h4>Games per year</h4><span class="sub">{chartYears}</span></header>
      <div class="body chart">
        {#if perYear.length}
          <BarChart data={perYear} x="year" y="n" color="var(--chart-2)" maxXTicks={8} />
        {:else}<p class="empty">No games in scope.</p>{/if}
      </div>
    </section>
  </div>
</div>

<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: var(--space-sm); margin-bottom: var(--space-md); }
  .tile { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: .6rem .75rem; display: flex; flex-direction: column; gap: .15rem; }
  .tile .k { font-size: 0.68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; }
  .tile .v { font-size: 1.35rem; font-weight: 700; line-height: 1.1; }
  .tnum { font-variant-numeric: tabular-nums; }
  .disclosure { display: flex; align-items: baseline; gap: .4rem; width: 100%; text-align: left; background: none; border: none; border-top: 1px solid var(--border); padding: .6rem 0 .5rem; margin-bottom: var(--space-sm); cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 650; color: var(--foreground); }
  .disclosure .caret { color: var(--muted-foreground); transition: transform 0.12s ease; }
  .disclosure .caret.open { transform: rotate(90deg); }
  .disclosure .sub { font-size: 0.72rem; font-weight: 400; color: var(--muted-foreground); }
  .panels.hidden { display: none; }
  .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-md); }
  @media (max-width: 860px) { .row { grid-template-columns: 1fr; } }
  .panel { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: var(--space-md); min-width: 0; }
  .panel header { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; margin-bottom: .5rem; }
  .panel h4 { margin: 0; font-size: 0.82rem; font-weight: 650; }
  .panel .sub { font-size: 0.68rem; color: var(--muted-foreground); }
  .body.chart { height: 17rem; }
  .empty { color: var(--muted-foreground); font-size: 0.82rem; text-align: center; padding: var(--space-lg) 0; }
</style>
