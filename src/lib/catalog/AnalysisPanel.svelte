<script lang="ts">
  /**
   * Read-only analysis of the CURRENT scope — About's weight-vs-rating and rating-vs-
   * popularity clouds, pointed at Explore's `where` instead of the whole catalog.
   *
   * A collapsed panel below the table, not folded into the Shape Strip (the strip's whole
   * interaction model is drag-to-filter, which a scatter has no natural gesture for) and not
   * a swap with the table either — the table should stay visible when this opens. See
   * `.canvas`/`overflow-y: auto` in +page.svelte and `.listwrap`'s `min-height` in
   * GameList.svelte: opening this no longer crushes the table down to fit the same bounded
   * box, it grows the canvas past that box and the pane scrolls to reveal it — "expand lower
   * using the screen," not "cover what's already there."
   *
   * No mechanics-frequency chart here — Rail's Mechanics facet list already answers that
   * scoped to the current filters (its own doc comment: "there is no longer a separate top
   * mechanics chart competing with it"), and it's already click-to-filter. Duplicating it here
   * would just be a second, read-only copy of something that already exists and does more.
   *
   * Charts are interactive: hover shows the game (via `nameOf`, the id→name map built for
   * exactly this), click navigates to it — unlike About's clouds, every point here is a real
   * game in the reader's own current scope, so "which one is that" is a real question.
   *
   * Queries only run while the panel is open — a collapsed panel costs nothing, matching the
   * query discipline the rest of Explore already applies (e.g. the header's count queries).
   */
  import { goto } from '$app/navigation';
  import { query, nameOf } from '$lib/catalog/catalog.svelte';
  import { scatterSql, popularitySql, measures } from '$lib/catalog/aggregates';
  import type { Scope } from '$lib/catalog/scope';
  import Scatter from '$lib/charts/Scatter.svelte';

  let { where, universe }: { where: string; universe: Scope['universe'] } = $props();

  let open = $state(false);
  const upcoming = $derived(universe === 'upcoming');

  type Pt = { x: number; y: number; game_id: number };

  let weightRating = $state<Pt[]>([]);
  let ratingPopularity = $state<Pt[]>([]);

  let token = 0;
  $effect(() => {
    if (!open) return;
    const w = where;
    const m = measures(universe);
    const mine = ++token;
    Promise.all([query<Pt>(scatterSql(w, undefined, m)), query<Pt>(popularitySql(w, undefined, m))])
      .then(([a, b]) => {
        if (mine !== token) return;
        weightRating = a;
        ratingPopularity = b;
      })
      .catch((e) => console.error('analysis panel query failed', e));
  });

  const openGame = (id: number) => goto(`/games/${id}`);
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
          height={300}
          interactive
          pointName={nameOf}
          onPointClick={openGame}
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
          height={300}
          interactive
          pointName={nameOf}
          onPointClick={openGame}
        />
      </div>
    </div>
  {/if}
</details>

<style>
  /* Matches Rail.svelte's `details.grp` chrome, so a collapsible section reads the same
     whether it's filtering or, here, read-only analysis. */
  .grp {
    flex: none;
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

  /* Side by side on anything wide enough; stacked on a narrow canvas. */
  .body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: var(--space-lg);
    align-content: start;
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
</style>
