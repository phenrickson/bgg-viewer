<script lang="ts">
  /**
   * Composition of the scoped set — best-at player count, top categories, top mechanics
   * as horizontal bars. Sits *below* the table (the games first, then what they're made
   * of). Recomputed in-browser on scope change.
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import { bestAtDistributionSql, topFacetSql, type PlayerCountBin, type Facet } from '$lib/catalog/aggregates';
  import RowBarChart from '$lib/charts/RowBarChart.svelte';

  let { where }: { where: string } = $props();

  let bestAt = $state<PlayerCountBin[]>([]);
  let topCats = $state<Facet[]>([]);
  let topMechs = $state<Facet[]>([]);

  const clip = (f: Facet) => ({ ...f, c: f.c.length > 22 ? f.c.slice(0, 21) + '…' : f.c });

  let token = 0;
  $effect(() => {
    const w = where;
    const mine = ++token;
    Promise.all([
      query<PlayerCountBin>(bestAtDistributionSql(w)),
      query<Facet>(topFacetSql(w, 'categories', 7)),
      query<Facet>(topFacetSql(w, 'mechanics', 7))
    ])
      .then(([ba, tc, tm]) => {
        if (mine !== token) return;
        bestAt = ba;
        topCats = tc.map(clip);
        topMechs = tm.map(clip);
      })
      .catch((e) => mine === token && console.error('composition aggregates failed', e));
  });
</script>

<div class="row">
  <section class="panel">
    <header><h4>Best at</h4><span class="sub">community-voted player count</span></header>
    <div class="body chart">
      {#if bestAt.length}
        <RowBarChart data={bestAt} label="count" value="n" color="var(--chart-5)" labelWidth={40} />
      {:else}<p class="empty">No player-count votes in scope.</p>{/if}
    </div>
  </section>

  <section class="panel">
    <header><h4>Top categories</h4><span class="sub">count in scope</span></header>
    <div class="body chart">
      {#if topCats.length}
        <RowBarChart data={topCats} label="c" value="n" color="var(--chart-3)" />
      {:else}<p class="empty">No categories in scope.</p>{/if}
    </div>
  </section>

  <section class="panel">
    <header><h4>Top mechanics</h4><span class="sub">count in scope</span></header>
    <div class="body chart">
      {#if topMechs.length}
        <RowBarChart data={topMechs} label="c" value="n" color="var(--chart-3)" />
      {:else}<p class="empty">No mechanics in scope.</p>{/if}
    </div>
  </section>
</div>

<style>
  .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-md); }
  @media (max-width: 860px) { .row { grid-template-columns: 1fr; } }
  .panel { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: var(--space-md); min-width: 0; }
  .panel header { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; margin-bottom: .5rem; }
  .panel h4 { margin: 0; font-size: 0.82rem; font-weight: 650; }
  .panel .sub { font-size: 0.68rem; color: var(--muted-foreground); }
  .body.chart { height: 17rem; }
  .empty { color: var(--muted-foreground); font-size: 0.82rem; text-align: center; padding: var(--space-lg) 0; }
</style>
