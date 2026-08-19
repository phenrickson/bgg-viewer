<script lang="ts">
  /**
   * Read-only analysis of the CURRENT scope — About's weight-vs-rating and rating-vs-
   * popularity clouds, pointed at Explore's `where` instead of the whole catalog.
   *
   * A collapsed panel below the table, not folded into the Shape Strip (the strip's whole
   * interaction model is drag-to-filter, which a scatter has no natural gesture for) and not
   * a swap with the table either — the table should stay visible when this opens. See
   * `.fixed-area`/`.canvas` in +page.svelte: everything above this panel is walled off in a
   * box sized to the canvas's full height regardless of whether this exists, so opening this
   * can never shrink the table — it only makes the canvas's total content taller than its own
   * box, which the canvas scrolls to reveal. "Expand lower using the screen," not "cover
   * what's already there."
   *
   * Also two ranked bar charts — top mechanics, top families — also scoped to the current
   * filters. These overlap with Rail's Mechanics/Families facet lists (which answer the same
   * "what's in this set" question and are already click-to-filter), so clicking a bar here
   * toggles the same `scope.mechanics`/`scope.families` Rail's lists bind to — one selection
   * state, not two that could disagree. The reason for a second view of the same data: Rail's
   * lists are collapsed by default and easy to miss, while this sits in the open, ranked, next
   * to the charts that already tell the rest of the scope's story.
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
  import { scatterSql, popularitySql, facetSearchSql, measures, type Facet } from '$lib/catalog/aggregates';
  import type { Scope } from '$lib/catalog/scope';
  import Scatter from '$lib/charts/Scatter.svelte';

  let {
    where,
    universe,
    scope = $bindable()
  }: { where: string; universe: Scope['universe']; scope: Scope } = $props();

  let open = $state(false);
  const upcoming = $derived(universe === 'upcoming');

  type Pt = { x: number; y: number; game_id: number };

  let weightRating = $state<Pt[]>([]);
  let ratingPopularity = $state<Pt[]>([]);
  let mechanics = $state<Facet[]>([]);
  let families = $state<Facet[]>([]);

  const TOP_N = 10;

  let token = 0;
  $effect(() => {
    if (!open) return;
    const w = where;
    const m = measures(universe);
    const mine = ++token;
    Promise.all([
      query<Pt>(scatterSql(w, undefined, m)),
      query<Pt>(popularitySql(w, undefined, m)),
      query<Facet>(facetSearchSql(w, 'mechanics', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'families', '', TOP_N))
    ])
      .then(([a, b, c, d]) => {
        if (mine !== token) return;
        weightRating = a;
        ratingPopularity = b;
        mechanics = c;
        families = d;
      })
      .catch((e) => console.error('analysis panel query failed', e));
  });

  const openGame = (id: number) => goto(`/games/${id}`);

  function toggleFacet(col: 'mechanics' | 'families', value: string) {
    const current = scope[col];
    scope[col] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }
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

      {#snippet facetChart(title: string, col: 'mechanics' | 'families', rows: Facet[])}
        <div class="figure">
          <h3>Top {title} in this scope</h3>
          <!-- PLACEHOLDER copy -->
          <p class="note">[Caption — click a bar to filter by it.]</p>
          {#if rows.length}
            {@const maxN = rows[0]?.n ?? 1}
            <ul class="fac">
              {#each rows as f (f.c)}
                {@const on = scope[col].includes(f.c)}
                <li>
                  <button type="button" class:on onclick={() => toggleFacet(col, f.c)}>
                    <span class="flbl">{f.c}</span>
                    <span class="fbar" aria-hidden="true"><i style:width="{(f.n / maxN) * 100}%"></i></span>
                    <span class="fn tnum">{f.n.toLocaleString()}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/snippet}

      {@render facetChart('mechanics', 'mechanics', mechanics)}
      {@render facetChart('families', 'families', families)}
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

  .fac {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .fac button {
    display: grid;
    grid-template-columns: minmax(6rem, 11rem) minmax(0, 1fr) 3rem;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    background: none;
    border: none;
    border-radius: 4px;
    padding: 0.2rem 0.3rem;
    margin: 0 -0.3rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
    color: inherit;
    text-align: left;
  }
  .fac button:hover {
    background: color-mix(in oklch, var(--primary) 8%, transparent);
  }
  .fac button.on {
    background: color-mix(in oklch, var(--primary) 14%, transparent);
  }
  .flbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fac button.on .flbl {
    font-weight: 650;
    color: var(--primary);
  }
  .fbar {
    display: block;
    height: 0.55rem;
    border-radius: 2px;
    background: color-mix(in oklch, var(--border) 70%, transparent);
    overflow: hidden;
  }
  .fbar i {
    display: block;
    height: 100%;
    background: var(--chart-4);
  }
  .fac button.on .fbar i {
    background: var(--primary);
  }
  .fn {
    text-align: right;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
