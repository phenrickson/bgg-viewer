<script lang="ts">
  /**
   * Read-only(-ish) analysis of the CURRENT scope, shown under Explore's List/Visualize
   * toggle — About's weight-vs-rating and rating-vs-popularity clouds, pointed at Explore's
   * `where` instead of the whole catalog, plus six ranked bar charts (categories, mechanics,
   * families, publishers, designers, artists).
   *
   * A SWAP with the table, not a panel appended below it. Appending it as a sibling below
   * GameList inside the same bounded `.canvas` fought GameList for the same box — GameList
   * shrinking to make room read as this rising up and covering the table. Swapping sidesteps
   * that: this occupies the exact slot GameList occupies and reuses the identical bounded-box
   * + internal-scroll pattern GameList's `.listwrap` already has (see `.wrap` below), so it's
   * a drop-in replacement for that slot rather than a new layout to reconcile with it. It only
   * exists in the DOM (and only queries) while selected.
   *
   * The bar charts overlap with Rail's facet lists (which answer the same "what's in this
   * set" question for the same six columns and are already click-to-filter), so clicking a
   * bar here toggles the same `scope.*` arrays Rail's lists bind to — one selection state, not
   * a second one that could disagree. The reason for a second view of the same data: Rail's
   * lists are collapsed by default and easy to miss, while this sits in the open, ranked, next
   * to the charts that already tell the rest of the scope's story.
   *
   * The two scatter charts are interactive: hover shows the game (via `nameOf`, the id→name
   * map built for exactly this), click navigates to it — unlike About's clouds, every point
   * here is a real game in the reader's own current scope, so "which one is that" is a real
   * question. Each also has a zoom button that opens the same chart, bigger, in a native
   * `<dialog>` — see the `weightChart`/`popularityChart` snippets below, shared by the inline
   * and dialog renderings so the two can't drift apart.
   *
   * The clouds plot the WHOLE universe (`baseWhere` — same comparison population the Shape
   * Strip uses), not just the narrower `where`-filtered set, with the current filters
   * highlighted and everything else faded to a backdrop (`Scatter`'s `selected` field). A
   * chart that only ever draws the filtered set has no visual answer to "where does this
   * narrowed selection sit within the whole population" — the shape of the backdrop is the
   * answer.
   */
  import { goto } from '$app/navigation';
  import { query, nameOf } from '$lib/catalog/catalog.svelte';
  import {
    scatterSelectionSql,
    popularitySelectionSql,
    facetSearchSql,
    measures,
    type Facet
  } from '$lib/catalog/aggregates';
  import type { Scope } from '$lib/catalog/scope';
  import Scatter from '$lib/charts/Scatter.svelte';

  let {
    where,
    baseWhere,
    universe,
    scope = $bindable()
  }: { where: string; baseWhere: string; universe: Scope['universe']; scope: Scope } = $props();

  const upcoming = $derived(universe === 'upcoming');

  type Pt = { x: number; y: number; game_id: number; selected: boolean };
  type FacetCol = 'categories' | 'mechanics' | 'families' | 'publishers' | 'designers' | 'artists';

  let weightRating = $state<Pt[]>([]);
  let ratingPopularity = $state<Pt[]>([]);
  let categories = $state<Facet[]>([]);
  let mechanics = $state<Facet[]>([]);
  let families = $state<Facet[]>([]);
  let publishers = $state<Facet[]>([]);
  let designers = $state<Facet[]>([]);
  let artists = $state<Facet[]>([]);
  /** True until the first query batch resolves — without this, switching to Visualize drew
      empty axes for a beat before any data arrived, which read as broken rather than loading. */
  let loading = $state(true);

  const TOP_N = 10;

  let token = 0;
  $effect(() => {
    const w = where;
    const m = measures(universe);
    const mine = ++token;
    const bw = baseWhere;
    Promise.all([
      query<Pt>(scatterSelectionSql(bw, w, undefined, m)),
      query<Pt>(popularitySelectionSql(bw, w, undefined, m)),
      query<Facet>(facetSearchSql(w, 'categories', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'mechanics', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'families', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'publishers', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'designers', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'artists', '', TOP_N))
    ])
      .then(([a, b, cat, c, d, e, f, g]) => {
        if (mine !== token) return;
        weightRating = a;
        ratingPopularity = b;
        categories = cat;
        mechanics = c;
        families = d;
        publishers = e;
        designers = f;
        artists = g;
        loading = false;
      })
      .catch((e) => {
        if (mine !== token) return;
        loading = false;
        console.error('analysis panel query failed', e);
      });
  });

  const openGame = (id: number) => goto(`/games/${id}`);

  function toggleFacet(col: FacetCol, value: string) {
    const current = scope[col];
    scope[col] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  /**
   * Expand-to-fullscreen for the two scatter charts — a native `<dialog>` rather than a
   * hand-rolled overlay, so Escape-to-close and focus-trapping come for free. Each chart's
   * Scatter call lives in one snippet (`weightChart`/`popularityChart`) parameterized on
   * `height`, rendered both inline (small) and in the dialog (big) — one source of truth for
   * the props, so the two can't drift apart.
   */
  let expanded = $state<'weight' | 'popularity' | null>(null);
  let dialogEl = $state<HTMLDialogElement | null>(null);

  function expand(which: 'weight' | 'popularity') {
    expanded = which;
    dialogEl?.showModal();
  }
  function closeExpanded() {
    dialogEl?.close();
  }
  /** The dialog's own padding area acts as the backdrop — clicking it (not its content) closes. */
  function backdropClick(e: MouseEvent) {
    if (e.target === dialogEl) closeExpanded();
  }
</script>

{#snippet weightChart(h: number)}
  <Scatter
    points={weightRating}
    xLabel={upcoming ? 'Predicted complexity (1–5)' : 'Complexity (1–5)'}
    yLabel={upcoming ? 'Predicted rating' : 'Average rating'}
    xTicks={[1, 2, 3, 4, 5]}
    yTicks={[2, 4, 6, 8, 10]}
    xDomain={[1, 5]}
    yDomain={[2, 10]}
    jitterX={0.06}
    height={h}
    interactive
    pointName={nameOf}
    onPointClick={openGame}
  />
{/snippet}

{#snippet popularityChart(h: number)}
  <Scatter
    points={ratingPopularity}
    xLabel={upcoming ? 'Predicted rating' : 'Average rating'}
    yLabel={upcoming ? 'Predicted ratings (log)' : 'Ratings (log)'}
    yLog
    xTicks={[2, 4, 6, 8, 10]}
    yTicks={[30, 100, 1000, 10000, 100000]}
    xDomain={[2, 10]}
    yDomain={[30, 100000]}
    height={h}
    interactive
    pointName={nameOf}
    onPointClick={openGame}
  />
{/snippet}

<div class="wrap">
  {#if loading}
    <p class="state">Loading…</p>
  {:else}
  <div class="body">
    <div class="figure">
      <div class="fhead">
        <h3>Complexity vs. rating</h3>
        <button type="button" class="zoom" onclick={() => expand('weight')} aria-label="Expand this chart"
          >⤢</button
        >
      </div>
      <!-- PLACEHOLDER copy -->
      <p class="note">[Caption — what the cloud shows.]</p>
      {@render weightChart(300)}
    </div>

    <div class="figure">
      <div class="fhead">
        <h3>Rating vs. popularity</h3>
        <button type="button" class="zoom" onclick={() => expand('popularity')} aria-label="Expand this chart"
          >⤢</button
        >
      </div>
      <!-- PLACEHOLDER copy -->
      <p class="note">[Caption — what the cloud shows.]</p>
      {@render popularityChart(300)}
    </div>

    {#snippet facetChart(title: string, col: FacetCol, rows: Facet[])}
      <div class="figure">
        <h3>Top {title}</h3>
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

    {@render facetChart('categories', 'categories', categories)}
    {@render facetChart('mechanics', 'mechanics', mechanics)}
    {@render facetChart('families', 'families', families)}
    {@render facetChart('publishers', 'publishers', publishers)}
    {@render facetChart('designers', 'designers', designers)}
    {@render facetChart('artists', 'artists', artists)}
  </div>
  {/if}
</div>

<dialog bind:this={dialogEl} class="chartdialog" onclick={backdropClick} onclose={() => (expanded = null)}>
  <div class="dhead">
    <h3>{expanded === 'popularity' ? 'Rating vs. popularity' : 'Complexity vs. rating'}</h3>
    <button type="button" class="close" onclick={closeExpanded} aria-label="Close">✕</button>
  </div>
  {#if expanded === 'weight'}
    {@render weightChart(560)}
  {:else if expanded === 'popularity'}
    {@render popularityChart(560)}
  {/if}
</dialog>

<style>
  /* Same bounded-box + internal-scroll pattern as GameList's .listwrap — this occupies the
     identical slot, so it should behave like the thing it's standing in for. */
  .wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 0 1 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    overflow-y: auto;
  }
  .state {
    margin: 0;
    padding: var(--space-xl);
    text-align: center;
    color: var(--muted-foreground);
  }

  /* Side by side on anything wide enough; stacked on a narrow canvas. */
  .body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: var(--space-lg);
    align-content: start;
    padding: var(--space-md);
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

  .fhead {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .fhead h3 {
    margin: 0;
  }
  .zoom {
    margin-left: auto;
    flex: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
    line-height: 1;
    padding: 0.1rem 0.3rem;
    font-size: 0.8rem;
  }
  .zoom:hover {
    color: var(--primary);
    border-color: var(--primary);
  }

  /* A native <dialog> — Escape-to-close and focus-trapping come for free from showModal().
     Open/close animation is the standard CSS-only pattern for <dialog> (MDN: "Customizing
     dialog and popover animations"): transition opacity/transform, plus `display` and the
     UA-controlled `overlay` property with `allow-discrete` so the element stays rendered
     through the closing transition instead of vanishing on the first frame, and
     `@starting-style` so the OPEN transition has a "from" state to animate out of (without
     it, an element with no prior rendered state can't interpolate into its first frame).
     No custom JS timing needed for either direction — this is what keeps it from being a
     bespoke reimplementation of what the platform already does. */
  .chartdialog {
    padding: var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    color: var(--foreground);
    width: min(92vw, 64rem);
    max-height: 88vh;
    opacity: 0;
    transform: scale(0.96) translateY(6px);
    transition:
      opacity 0.16s ease,
      transform 0.16s ease,
      overlay 0.16s ease allow-discrete,
      display 0.16s ease allow-discrete;
  }
  .chartdialog[open] {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  @starting-style {
    .chartdialog[open] {
      opacity: 0;
      transform: scale(0.96) translateY(6px);
    }
  }
  .chartdialog::backdrop {
    background: oklch(0 0 0 / 0);
    transition:
      background 0.16s ease,
      overlay 0.16s ease allow-discrete,
      display 0.16s ease allow-discrete;
  }
  .chartdialog[open]::backdrop {
    background: oklch(0 0 0 / 0.45);
  }
  @starting-style {
    .chartdialog[open]::backdrop {
      background: oklch(0 0 0 / 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chartdialog,
    .chartdialog::backdrop {
      transition: none;
    }
  }
  .dhead {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .dhead h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 650;
  }
  .close {
    margin-left: auto;
    flex: none;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    font-size: 0.85rem;
  }
  .close:hover {
    color: var(--primary);
    border-color: var(--primary);
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
