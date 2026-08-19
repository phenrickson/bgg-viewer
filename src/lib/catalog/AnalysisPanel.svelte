<script lang="ts">
  /**
   * Read-only analysis of the CURRENT scope — the same ideas already built for About
   * (weight-vs-rating, rating-vs-popularity), pointed at Explore's `where` instead of the
   * whole catalog, plus a mechanics-frequency view.
   *
   * Deliberately a collapsed panel below the table, not folded into the Shape Strip: the
   * strip's whole interaction model is "drag a chart to filter further," which fits
   * histograms naturally. A scatter plot or a ranked mechanics list has no obvious
   * drag-to-filter gesture, so this stays read-only analysis instead of inventing one.
   *
   * Queries only run while the panel is open — a collapsed panel costs nothing, matching the
   * query discipline the rest of Explore already applies (e.g. the header's count queries).
   */
  import { query } from '$lib/catalog/catalog.svelte';
  import { scatterSql, popularitySql, facetSearchSql, measures, type Facet } from '$lib/catalog/aggregates';
  import type { Scope } from '$lib/catalog/scope';
  import Scatter from '$lib/charts/Scatter.svelte';

  let { where, universe }: { where: string; universe: Scope['universe'] } = $props();

  let open = $state(false);
  const upcoming = $derived(universe === 'upcoming');

  type Pt = { x: number; y: number };

  let weightRating = $state<Pt[]>([]);
  let ratingPopularity = $state<Pt[]>([]);
  let mechanics = $state<Facet[]>([]);

  let token = 0;
  $effect(() => {
    if (!open) return;
    const w = where;
    const m = measures(universe);
    const mine = ++token;
    Promise.all([
      query<Pt>(scatterSql(w, undefined, m)),
      query<Pt>(popularitySql(w, undefined, m)),
      query<Facet>(facetSearchSql(w, 'mechanics', '', 12))
    ])
      .then(([a, b, c]) => {
        if (mine !== token) return;
        weightRating = a;
        ratingPopularity = b;
        mechanics = c;
      })
      .catch((e) => console.error('analysis panel query failed', e));
  });

  const maxN = $derived(mechanics[0]?.n ?? 1);
</script>

<details class="grp" bind:open>
  <summary>
    <span class="lbl">Analysis</span>
    <span class="chev" aria-hidden="true">›</span>
  </summary>

  {#if open}
    <div class="body">
      <div class="figure">
        <h3>Complexity vs. rating</h3>
        <!-- PLACEHOLDER copy -->
        <p class="note">[Caption — what the cloud shows for the current scope.]</p>
        <Scatter
          points={weightRating}
          xLabel={upcoming ? 'Predicted complexity (1–5)' : 'Complexity (1–5)'}
          yLabel={upcoming ? 'Predicted rating' : 'Average rating'}
          xTicks={[1, 2, 3, 4, 5]}
          yTicks={[2, 4, 6, 8, 10]}
          jitterX={0.06}
          height={280}
        />
      </div>

      <div class="figure">
        <h3>Rating vs. popularity</h3>
        <!-- PLACEHOLDER copy -->
        <p class="note">[Caption — what the cloud shows for the current scope.]</p>
        <Scatter
          points={ratingPopularity}
          xLabel={upcoming ? 'Predicted rating' : 'Average rating'}
          yLabel={upcoming ? 'Predicted # of ratings (log scale)' : 'People who rated it (log scale)'}
          yLog
          xTicks={[2, 4, 6, 8, 10]}
          yTicks={[30, 100, 1000, 10000, 100000]}
          height={280}
        />
      </div>

      <div class="figure">
        <h3>Mechanics in this scope</h3>
        <!-- PLACEHOLDER copy -->
        <p class="note">[Caption — how to read the ranked list.]</p>
        {#if mechanics.length}
          <ul class="mech">
            {#each mechanics as f (f.c)}
              <li>
                <span class="mlbl">{f.c}</span>
                <span class="mbar" aria-hidden="true"><i style:width="{(f.n / maxN) * 100}%"></i></span>
                <span class="mn tnum">{f.n.toLocaleString()}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</details>

<style>
  /* Matches Rail.svelte's `details.grp` chrome, so a collapsible section reads the same
     whether it's filtering or, here, read-only analysis. */
  .grp {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
  }
  .grp summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem var(--space-md);
    cursor: pointer;
    list-style: none;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .grp summary::-webkit-details-marker {
    display: none;
  }
  .grp summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .grp summary:hover .lbl {
    color: var(--primary);
  }
  .chev {
    margin-left: auto;
    color: var(--muted-foreground);
    transition: transform 0.12s ease;
  }
  .grp[open] .chev {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }

  .body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--space-lg);
    padding: 0 var(--space-md) var(--space-md);
  }
  .figure h3 {
    margin: 0 0 0.2rem;
    font-size: 0.85rem;
    font-weight: 650;
  }
  .note {
    margin: 0 0 0.5rem;
    font-size: 0.76rem;
    color: var(--muted-foreground);
  }

  .mech {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .mech li {
    display: grid;
    grid-template-columns: minmax(6rem, 10rem) minmax(0, 1fr) 3rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.78rem;
  }
  .mlbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mbar {
    display: block;
    height: 0.55rem;
    border-radius: 2px;
    background: color-mix(in oklch, var(--border) 70%, transparent);
    overflow: hidden;
  }
  .mbar i {
    display: block;
    height: 100%;
    background: var(--chart-4);
  }
  .mn {
    text-align: right;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
