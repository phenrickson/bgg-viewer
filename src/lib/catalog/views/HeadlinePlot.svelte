<script lang="ts">
  /**
   * The headline plot — every game in scope as a point (complexity × rating). The plot is
   * the games *and* their shape at once, so it leads the canvas. Points are pulled
   * column-wise (typed arrays) and drawn by ScatterCanvas's imperative canvas loop.
   */
  import { queryColumns, nameOf } from '$lib/catalog/catalog.svelte';
  import { scatterSql, type ScatterPoint } from '$lib/catalog/aggregates';
  import ScatterCanvas from '$lib/charts/ScatterCanvas.svelte';

  let { where }: { where: string } = $props();

  let points = $state<ScatterPoint[]>([]);
  let loading = $state(true);

  async function load(w: string): Promise<ScatterPoint[]> {
    const c = await queryColumns(scatterSql(w), ['x', 'y', 'game_id']);
    const xs = c.x,
      ys = c.y,
      ids = c.game_id;
    const n = xs.length;
    const pts: ScatterPoint[] = new Array(n);
    for (let i = 0; i < n; i++) pts[i] = { x: xs[i], y: ys[i], game_id: ids[i] };
    return pts;
  }

  let token = 0;
  $effect(() => {
    const w = where;
    const mine = ++token;
    loading = true;
    load(w)
      .then((pts) => {
        if (mine !== token) return;
        points = pts;
        loading = false;
      })
      .catch((e) => {
        if (mine === token) {
          console.error('plot query failed', e);
          loading = false;
        }
      });
  });
</script>

<section class="card">
  <header>
    <h4>Plot <span class="sub">· the games, spatially · {points.length.toLocaleString()} games</span></h4>
    {#if loading}<span class="sub">updating…</span>{/if}
  </header>
  <div class="chart">
    {#if points.length}
      <ScatterCanvas
        data={points}
        {nameOf}
        xDomain={[1, 5]}
        yDomain={[2, 9]}
        xLabel="complexity"
        yLabel="rating"
        color="var(--chart-4)"
      />
    {:else if !loading}
      <p class="empty">No games in scope.</p>
    {/if}
  </div>
</section>

<style>
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    padding: var(--space-md);
    min-width: 0;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  h4 {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 650;
  }
  .sub {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .chart {
    height: 24rem;
  }
  .empty {
    color: var(--muted-foreground);
    font-size: 0.82rem;
    text-align: center;
    padding: var(--space-lg) 0;
  }
</style>
