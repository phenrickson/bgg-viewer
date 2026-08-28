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
    bestAtDistributionSql,
    recommendedOnlyDistributionSql,
    complexityBandsSql,
    measures,
    type BandBin,
    type Facet,
    type PlayerCountBin
  } from '$lib/catalog/aggregates';
  import { COMPLEXITY_BANDS, type Scope } from '$lib/catalog/scope';
  import Scatter from '$lib/charts/Scatter.svelte';
  import MiniColumns from '$lib/charts/MiniColumns.svelte';
  import StackedColumns from '$lib/charts/StackedColumns.svelte';
  import ChartFigure from '$lib/charts/ChartFigure.svelte';

  let {
    where,
    baseWhere,
    universe,
    scope = $bindable()
  }: { where: string; baseWhere: string; universe: Scope['universe']; scope: Scope } = $props();

  const upcoming = $derived(universe === 'upcoming');

  type Pt = { x: number; y: number; game_id: number; selected: boolean };
  type FacetCol = 'categories' | 'mechanics' | 'families' | 'publishers' | 'designers' | 'artists';

  /** Player counts 1–8, matching ShapeStrip's BEST_AT_DOMAIN — the x domain for the
   *  Best-at chart, so an empty count still holds its slot. */
  const PLAYER_COUNT_DOMAIN = [1, 2, 3, 4, 5, 6, 7, 8];

  /** The five named bands, as their 1-indexed `scope.weightBands` values — the chart's x
   *  domain, so an empty band still holds its slot instead of the axis resizing under a filter. */
  const BAND_DOMAIN = COMPLEXITY_BANDS.map((_, i) => i + 1);
  const bandLabel = (i: number) => COMPLEXITY_BANDS[i - 1]?.label ?? String(i);

  let bandBins = $state<BandBin[]>([]);
  let bandBackdrop = $state<BandBin[]>([]);

  let weightRating = $state<Pt[]>([]);
  let ratingPopularity = $state<Pt[]>([]);
  let bestBins = $state<PlayerCountBin[]>([]);
  let recommendedOnlyBins = $state<PlayerCountBin[]>([]);
  /** Unfiltered counterparts of bestBins/recommendedOnlyBins — not drawn, only scale StackedColumns
   *  so its bars shrink under a filter instead of re-normalising to fill the chart every time. */
  let bestBackdrop = $state<PlayerCountBin[]>([]);
  let recommendedOnlyBackdrop = $state<PlayerCountBin[]>([]);
  let categories = $state<Facet[]>([]);
  let mechanics = $state<Facet[]>([]);
  let families = $state<Facet[]>([]);
  let publishers = $state<Facet[]>([]);
  let designers = $state<Facet[]>([]);
  let artists = $state<Facet[]>([]);
  /** True until the first query batch resolves — without this, switching to Visualize drew
      empty axes for a beat before any data arrived, which read as broken rather than loading. */
  let loading = $state(true);

  /** Shared across both scatter charts, not per-chart — they're two views of the SAME
   *  selection, so hiding the comparison cloud on one and not the other would read as a bug
   *  rather than a choice. Default on: the backdrop is the reason these plot the whole
   *  universe instead of just the filtered set (see the file doc comment above). */
  let showBackdrop = $state(true);

  /**
   * Whether the distribution charts (complexity, both player-count charts) draw the whole
   * catalog behind the scope. Kept SEPARATE from `showBackdrop` above, and OFF by default:
   * these are read as "what does my current set look like", and against the whole catalog's
   * silhouette a narrow scope collapses to a sliver of the plot — the shape you filtered down
   * to find is exactly what gets lost. Self-scaled by default; the comparison is one click
   * away when it's the question being asked.
   */
  let showPlayerBackdrop = $state(false);

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
      query<BandBin>(complexityBandsSql(w, m)),
      query<BandBin>(complexityBandsSql(bw, m)),
      query<PlayerCountBin>(bestAtDistributionSql(w)),
      query<PlayerCountBin>(recommendedOnlyDistributionSql(w)),
      query<PlayerCountBin>(bestAtDistributionSql(bw)),
      query<PlayerCountBin>(recommendedOnlyDistributionSql(bw)),
      query<Facet>(facetSearchSql(w, 'categories', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'mechanics', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'families', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'publishers', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'designers', '', TOP_N)),
      query<Facet>(facetSearchSql(w, 'artists', '', TOP_N))
    ])
      .then(
        ([
          a,
          b,
          bands,
          bandsBack,
          best,
          recOnly,
          bestBack,
          recOnlyBack,
          cat,
          c,
          d,
          e,
          f,
          g
        ]) => {
        if (mine !== token) return;
        weightRating = a;
        ratingPopularity = b;
        bandBins = bands;
        bandBackdrop = bandsBack;
        bestBins = best;
        recommendedOnlyBins = recOnly;
        bestBackdrop = bestBack;
        recommendedOnlyBackdrop = recOnlyBack;
        categories = cat;
        mechanics = c;
        families = d;
        publishers = e;
        designers = f;
        artists = g;
        loading = false;
        }
      )
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
   * Bands OR together rather than replacing each other — the same additive semantics as the
   * rail's Complexity checkboxes, which bind to this very field. Deliberately NOT the
   * exclusive one-at-a-time behaviour of the player-count picks below: those answer a single
   * question ("at how many players"), while "Light or Heavy, nothing in between" is a real
   * selection weightBands exists to express (see scope.ts).
   */
  function toggleBand(i: number | null) {
    if (i == null) {
      scope.weightBands = [];
      return;
    }
    const cur = scope.weightBands;
    scope.weightBands = cur.includes(i) ? cur.filter((b) => b !== i) : [...cur, i].sort();
  }

  const bandTitle = (i: number, n: number) =>
    `${bandLabel(i)} — ${n.toLocaleString()} games in scope`;

  function onHoverBand(i: number | null) {
    if (i == null) {
      hoverBand = null;
      return;
    }
    hoverBand = bandTitle(i, bandBins.find((b) => b.band === i)?.n ?? 0);
  }

  /**
   * The Best-at chart stacks two disjoint series, so which one was clicked decides which
   * filter is set: the blue segment selects "best at N", the amber "recommended at N but not
   * best" — the same set `recommendedOnlyDistributionSql` counted for that segment. The three
   * player-count questions stay mutually exclusive, as in `setPlayerCount`.
   */
  function pickBestAt(v: number | null, series: 1 | 2 = 1) {
    const rec = series === 2;
    scope.bestAt = rec ? null : v;
    scope.recommendedAt = rec ? v : null;
    if (v != null) scope.players = null;
  }

  /**
   * One formatting function per chart, shared between the chart's own `title=` (native
   * tooltip, kept as a baseline/accessible fallback) and the readout line below each header —
   * so the two can't drift apart into saying different things for the same hover.
   */
  const bestTitle = (v: number, n1: number, n2: number) =>
    `${v} players — best: ${n1.toLocaleString()}, recommended: ${n2.toLocaleString()}`;

  /** Reserved-height readout text for each chart's header row — see the `.readout` CSS: fixed
   *  height whether or not something is hovered, so hovering one chart doesn't grow its card
   *  and knock the two charts' axes out of alignment with each other. */
  /* One readout per chart, each on its own fixed-height line inside that chart's frame — the
     line is always rendered, so a hover can never resize a figure and shift the row. */
  let hoverBest = $state<string | null>(null);
  let hoverBand = $state<string | null>(null);

  function onHoverBest(v: number | null) {
    if (v == null) {
      hoverBest = null;
      return;
    }
    const n1 = bestBins.find((b) => b.count === v)?.n ?? 0;
    const n2 = recommendedOnlyBins.find((b) => b.count === v)?.n ?? 0;
    hoverBest = bestTitle(v, n1, n2);
  }

  /**
   * Expand-to-fullscreen for the two scatter charts — a native `<dialog>` rather than a
   * hand-rolled overlay, so Escape-to-close and focus-trapping come for free. Each chart's
   * Scatter call lives in one snippet (`weightChart`/`popularityChart`) parameterized on
   * `height`, rendered both inline (small) and in the dialog (big) — one source of truth for
   * the props, so the two can't drift apart.
   *
   * The dialog also requests true Fullscreen API on open — the same mechanism a video player
   * uses — so "expand" means the whole screen, not a bigger box in the middle of the page.
   * `fsHeight` tracks the chart's height while fullscreen so the plot actually fills the
   * space rather than sitting at its 560px dialog size inside a much taller viewport.
   * `requestFullscreen` is optional-chained and its promise swallowed: if a browser or embed
   * context refuses it, the dialog still opens as a normal centered modal — the size is a
   * bonus, not a requirement of "expand" working at all.
   */
  let expanded = $state<'weight' | 'popularity' | null>(null);
  let dialogEl = $state<HTMLDialogElement | null>(null);
  let fsHeight = $state(560);

  function expand(which: 'weight' | 'popularity') {
    expanded = which;
    dialogEl?.showModal();
    dialogEl?.requestFullscreen?.()?.catch(() => {});
  }
  function closeExpanded() {
    if (document.fullscreenElement === dialogEl) document.exitFullscreen().catch(() => {});
    dialogEl?.close();
  }
  // The browser's own fullscreen exit (Esc, or an OS/browser fullscreen control) doesn't go
  // through closeExpanded() — this keeps the dialog in sync when that happens, and sizes the
  // chart to the real viewport once fullscreen actually takes effect.
  $effect(() => {
    function onFsChange() {
      if (document.fullscreenElement === dialogEl) {
        fsHeight = Math.max(320, window.innerHeight - 96);
      } else if (expanded !== null) {
        dialogEl?.close();
      }
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  });
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
    {showBackdrop}
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
    {showBackdrop}
    pointName={nameOf}
    onPointClick={openGame}
  />
{/snippet}

<!-- PARKED — the Selected/All backdrop toggle. The charts are self-scaled for now (they read
     as "what does my current set look like", and the catalog silhouette shrank a narrow scope
     to a sliver). The backdrop DATA is still queried and `showPlayerBackdrop` still exists, so
     re-enabling is: uncomment this, render it in a header, and pass the backdrop props again.
{#snippet playerBackdropToggle()}
  <div class="seg" role="group" aria-label="Backdrop">
    <button
      type="button"
      class:on={!showPlayerBackdrop}
      aria-pressed={!showPlayerBackdrop}
      title="Scale to the games in scope only."
      onclick={() => (showPlayerBackdrop = false)}>Selected</button
    >
    <button
      type="button"
      class:on={showPlayerBackdrop}
      aria-pressed={showPlayerBackdrop}
      title="Compare against every game in the catalog."
      onclick={() => (showPlayerBackdrop = true)}>All</button
    >
  </div>
{/snippet}
-->

<div class="wrap">
  {#if loading}
    <p class="state">Loading…</p>
  {:else}
  <div class="body">
    <!-- PARKED — not deleted. The two scatter clouds below are being relocated; they read as a
         solid slab of ink at this scope's point density and cost the two widest slots on the
         page, but they still work and are wanted elsewhere. Everything they need is still live
         in this file: the `weightChart`/`popularityChart` snippets, the fullscreen <dialog>,
         `showBackdrop`, `expand`/`closeExpanded`, and the `.zoom`/`.chartdialog` CSS. Deleting
         the block below re-enables nothing — uncommenting it does.
    <div class="figure">
      <div class="fhead">
        <h3>Complexity vs. rating</h3>
        <div class="seg" role="group" aria-label="Backdrop">
          <button
            type="button"
            class:on={showBackdrop}
            aria-pressed={showBackdrop}
            title="Show every game in scope as a faded backdrop behind the selection."
            onclick={() => (showBackdrop = true)}>All</button
          >
          <button
            type="button"
            class:on={!showBackdrop}
            aria-pressed={!showBackdrop}
            title="Show only the selected games — no backdrop."
            onclick={() => (showBackdrop = false)}>Selected</button
          >
        </div>
        <button type="button" class="zoom" onclick={() => expand('weight')} aria-label="Expand this chart"
          >⤢</button
        >
      </div>
      {@render weightChart(300)}
    </div>

    <div class="figure">
      <div class="fhead">
        <h3>Rating vs. popularity</h3>
        <div class="seg" role="group" aria-label="Backdrop">
          <button
            type="button"
            class:on={showBackdrop}
            aria-pressed={showBackdrop}
            title="Show every game in scope as a faded backdrop behind the selection."
            onclick={() => (showBackdrop = true)}>All</button
          >
          <button
            type="button"
            class:on={!showBackdrop}
            aria-pressed={!showBackdrop}
            title="Show only the selected games — no backdrop."
            onclick={() => (showBackdrop = false)}>Selected</button
          >
        </div>
        <button type="button" class="zoom" onclick={() => expand('popularity')} aria-label="Expand this chart"
          >⤢</button
        >
      </div>
      {@render popularityChart(300)}
    </div>
    -->

    <div class="distributions">
    <ChartFigure title="Games by complexity">
      {#snippet readout()}{hoverBand ?? ' '}{/snippet}
      <MiniColumns
        bins={bandBins.map((b) => ({ v: b.band, n: b.n }))}
        backdrop={[]}
        domain={BAND_DOMAIN}
        selected={null}
        multi={scope.weightBands}
        height={104}
        color="var(--chart-1)"
        label={bandLabel}
        title={bandTitle}
        onpick={toggleBand}
        onhover={onHoverBand}
      />
    </ChartFigure>

    <ChartFigure title="Best at N players">
      {#snippet legend()}
        <span class="swatch" style:--sw="var(--chart-1)"></span>best
        <span class="swatch" style:--sw="var(--chart-2)"></span>recommended
      {/snippet}
      {#snippet readout()}{hoverBest ?? ' '}{/snippet}
      <StackedColumns
        bins={bestBins.map((b) => ({ v: b.count, n: b.n }))}
        bins2={recommendedOnlyBins.map((b) => ({ v: b.count, n: b.n }))}
        domain={PLAYER_COUNT_DOMAIN}
        selected={scope.bestAt ?? scope.recommendedAt}
        selectedSeries={scope.recommendedAt != null ? 2 : 1}
        height={104}
        title={bestTitle}
        onpick={pickBestAt}
        onhover={onHoverBest}
      />
    </ChartFigure>
    </div>

    {#snippet facetChart(title: string, col: FacetCol, rows: Facet[])}
      <ChartFigure title="Top {title}">
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
      </ChartFigure>
    {/snippet}

    <div class="facets">
      {@render facetChart('categories', 'categories', categories)}
      {@render facetChart('mechanics', 'mechanics', mechanics)}
      {@render facetChart('families', 'families', families)}
      {@render facetChart('publishers', 'publishers', publishers)}
      {@render facetChart('designers', 'designers', designers)}
      {@render facetChart('artists', 'artists', artists)}
    </div>
  </div>
  {/if}
</div>

<dialog bind:this={dialogEl} class="chartdialog" onclick={backdropClick} onclose={() => (expanded = null)}>
  <div class="dhead">
    <h3>{expanded === 'popularity' ? 'Rating vs. popularity' : 'Complexity vs. rating'}</h3>
    <button type="button" class="close" onclick={closeExpanded} aria-label="Close">✕</button>
  </div>
  {#if expanded === 'weight'}
    {@render weightChart(fsHeight)}
  {:else if expanded === 'popularity'}
    {@render popularityChart(fsHeight)}
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

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding: var(--space-md);
  }
  /* Two grids, not one. Every distribution chart is the same fixed height and every facet
     list is ~one height, but a single auto-fit grid mixing the two put a short chart and a
     tall list in the same row — the chart left floating in whitespace. Split by kind and
     every row is flush; it also reads in order (the set's shape, then what's in it). */
  .distributions,
  .facets {
    display: grid;
    gap: var(--space-lg);
    align-content: start;
  }
  .distributions {
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }
  .facets {
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  }
  /* Keeps a short facet list (few distinct values in a narrow scope) from collapsing to a
     stub and knocking its row out of alignment. */
  .facets .fac {
    min-height: 12.5rem;
  }
  /* Only the stacked chart needs a colour key — the single-colour charts don't. */
  .legend {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.35rem;
    font-size: 0.72rem;
    color: var(--muted-foreground);
  }
  /* Reserved space for the hover readout, present (blank) whether or not something is
     hovered — a height that only appears while hovering would grow that one card and throw
     off the shared axis alignment with its neighbour (see the .fhead min-height rule, same
     problem). Sits in normal flow, so — unlike a floating tooltip — it can't be clipped by
     the panel's own overflow-y: auto. */
  .readout {
    min-height: 1rem;
    margin-bottom: 0.2rem;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .swatch {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 2px;
    background: var(--sw);
  }
  .swatch:not(:first-child) {
    margin-left: 0.5rem;
  }
  .fhead {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Explicit, not content-derived: a bare h3 and an h3 + colour-swatch legend naturally
       compute to different line heights, which put charts sharing a row at different vertical
       offsets — their axes didn't align even though the cards themselves were the same height.
       A fixed min-height makes every .fhead the same height regardless of what it holds. */
    min-height: 1.6rem;
  }
  .fhead h3 {
    margin: 0;
  }
  /* `.zoom`, `.fhead` and `.legend` below are used only by the PARKED scatter figures above
     (the live charts now use ChartFigure's own frame), so svelte-check reports them as unused
     selectors. Kept deliberately: they come back the moment that block is uncommented. */
  .zoom {
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
  /* Same segmented-pill pattern as the Shape Strip's Count|Share control directly above this
     panel — two boolean-ish toggles in the same workspace should look like the same control,
     not two different UI languages for the same idea. Carries the `margin-left: auto` that
     pushes the trailing pair (this + `.zoom`) to the right of the title. */
  .seg {
    margin-left: auto;
    flex: none;
    display: flex;
    gap: 0.15rem;
    background: var(--muted);
    border-radius: 7px;
    padding: 0.1rem;
  }
  .seg button {
    border: none;
    background: none;
    border-radius: 5px;
    color: var(--muted-foreground);
    font: inherit;
    font-size: 0.7rem;
    padding: 0.08rem 0.4rem;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--card);
    color: var(--foreground);
    font-weight: 600;
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
    /* Tailwind's preflight resets `margin: 0` on every element, `dialog` included, which
       quietly overrides the browser's own `dialog:modal { margin: auto }` centering rule —
       author styles beat UA styles regardless of specificity. Without an explicit margin the
       dialog falls back to its top-left corner instead of centering. Restoring `auto` here is
       the standard fix, not a hand-rolled centering scheme. */
    margin: auto;
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
  /* True Fullscreen API state (not just the modal's own centered-box sizing) — edge to edge,
     no card border or rounding once it's the whole screen. */
  .chartdialog:fullscreen {
    width: 100vw;
    max-width: 100vw;
    height: 100vh;
    max-height: 100vh;
    margin: 0;
    border: none;
    border-radius: 0;
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
    background: var(--chart-1);
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
