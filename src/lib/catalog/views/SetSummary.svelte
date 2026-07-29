<script lang="ts">
  /**
   * Set summary — the secondary "what kind of games are these?" lens: stat tiles plus
   * aggregate charts (rating distribution, games per year, top categories) over the scoped
   * set. Demoted below the headline plot + table; the individual games are the headline,
   * this characterizes their shape.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import {
    summarySql,
    ratingHistogramSql,
    gamesPerYearSql,
    topFacetSql,
    type Summary,
    type Bin,
    type YearCount,
    type Facet
  } from '$lib/catalog/aggregates';
  import BarChart from '$lib/charts/BarChart.svelte';
  import RowBarChart from '$lib/charts/RowBarChart.svelte';

  let { where }: { where: string } = $props();

  let summary = $state<Summary | null>(null);
  let ratingBins = $state<Bin[]>([]);
  let perYear = $state<YearCount[]>([]);
  let topCats = $state<Facet[]>([]);
  let loading = $state(true);

  let token = 0;
  $effect(() => {
    const w = where;
    const mine = ++token;
    loading = true;
    Promise.all([
      query<Summary>(summarySql(w)),
      query<Bin>(ratingHistogramSql(w)),
      query<YearCount>(gamesPerYearSql(w)),
      query<Facet>(topFacetSql(w, 'categories'))
    ])
      .then(([s, rb, py, tc]) => {
        if (mine !== token) return;
        summary = s[0] ?? null;
        ratingBins = rb;
        perYear = py;
        topCats = tc.map((f) => ({ ...f, c: f.c.length > 20 ? f.c.slice(0, 19) + '…' : f.c }));
        loading = false;
      })
      .catch((e) => {
        if (mine === token) {
          console.error('summary aggregates failed', e);
          loading = false;
        }
      });
  });

  const fmt = (n: number | null | undefined, d = 2) => (n == null ? '—' : n.toFixed(d));
  const onlyDecade = (v: number) => (v % 10 === 0 ? String(v) : '');
  const onlyWhole = (v: number) => (Number.isInteger(v) ? String(v) : '');
  const chartYears = $derived(
    perYear.length ? `${perYear[0].year}–${perYear[perYear.length - 1].year}` : '—'
  );
</script>

<div class="tiles">
  <div class="tile"><span class="k">Games</span><b class="v tnum">{(summary?.total ?? 0).toLocaleString()}</b></div>
  <div class="tile"><span class="k">Upcoming / unrated</span><b class="v tnum">{(summary?.upcoming ?? 0).toLocaleString()}</b></div>
  <div class="tile"><span class="k">Median complexity</span><b class="v tnum">{fmt(summary?.median_weight)}</b></div>
  <div class="tile"><span class="k">Median geek rating</span><b class="v tnum">{fmt(summary?.median_geek)}</b></div>
</div>

<div class="grid">
  <section class="panel">
    <header><h4>Rating distribution</h4><span class="sub">average rating, {ratingBins.length} bins</span></header>
    <div class="body chart">
      {#if ratingBins.length}
        <BarChart data={ratingBins} x="bucket" y="n" color="var(--chart-1)" xFormat={onlyWhole} />
      {:else}<p class="empty">No rated games in scope.</p>{/if}
    </div>
  </section>

  <section class="panel">
    <header><h4>Games per year</h4><span class="sub">{chartYears}</span></header>
    <div class="body chart">
      {#if perYear.length}
        <BarChart data={perYear} x="year" y="n" color="var(--chart-2)" xFormat={onlyDecade} />
      {:else}<p class="empty">No games in scope.</p>{/if}
    </div>
  </section>

  <section class="panel span2">
    <header><h4>Top categories</h4><span class="sub">count in scope</span></header>
    <div class="body">
      {#if topCats.length}
        <RowBarChart data={topCats} label="c" value="n" color="var(--chart-3)" />
      {:else}<p class="empty">No categories in scope.</p>{/if}
    </div>
  </section>
</div>

{#if loading}<p class="loading">Updating…</p>{/if}

<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: var(--space-sm); margin-bottom: var(--space-md); }
  .tile { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: .6rem .75rem; display: flex; flex-direction: column; gap: .15rem; }
  .tile .k { font-size: 0.68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); font-weight: 600; }
  .tile .v { font-size: 1.35rem; font-weight: 700; line-height: 1.1; }
  .tnum { font-variant-numeric: tabular-nums; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); }
  .span2 { grid-column: 1 / -1; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
  .panel { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: var(--space-md); min-width: 0; }
  .panel header { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; margin-bottom: .5rem; }
  .panel h4 { margin: 0; font-size: 0.82rem; font-weight: 650; }
  .panel .sub { font-size: 0.7rem; color: var(--muted-foreground); }
  .body.chart { height: 16rem; }
  .empty { color: var(--muted-foreground); font-size: 0.82rem; text-align: center; padding: var(--space-lg) 0; }
  .loading { color: var(--muted-foreground); font-size: 0.78rem; margin-top: var(--space-sm); }
</style>
