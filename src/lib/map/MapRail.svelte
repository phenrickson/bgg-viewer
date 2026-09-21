<script lang="ts">
  /**
   * The map's scope rail — the catalog rail's doctrine and its components, over `ViewState`.
   *
   * The map's controls used to be fifteen items in one flex-wrap strip, every one at equal
   * weight. That is right for a bench with one user who wants everything a click away, and
   * wrong for a feature: it wraps unpredictably, affords no grouping, and tells a first-time
   * visitor that choosing a principal component is as ordinary as choosing a colour. The fix
   * is the one `Rail.svelte` already found — priority, not fewer capabilities:
   *
   *   1. **Always open** — Colour and Size. What you reach for first, and what changes what
   *      you are looking at rather than which games are in view.
   *   2. **Collapsed, counted** — Projection (with its axis pair) and Filters. A shut group
   *      with a badge is one line and still says what it is set to, so PC3–PC6 stay one
   *      click from Phil without shouting at everyone else.
   *   3. **Moved out of the rail** — Pan/Lasso and Export float on the canvas; search sits
   *      above it. Those act on the current view rather than on its scope, so they belong
   *      where you are looking rather than in a column of settings.
   *
   * The timeline is the exception to (3): it was briefly a full-width row under the map, on
   * the reasoning that a scrubber wants room, but that spent the whole bottom edge on one
   * control and left the rail bottom-heavy. Stacked in 16rem it fits, and the rail is where
   * you look for "which games am I seeing".
   *
   * Chrome comes from `catalog/rail/*` — the same `RailGroup` and `SegGroup` the catalog rail
   * uses, so the two rails are one thing rather than two that resemble each other. An earlier
   * version of this file copied Rail's CSS instead and drifted immediately: native selects
   * where the house uses segmented buttons, no section headings, no accent on the active
   * state.
   *
   * What is deliberately NOT shared is the state model. `Scope` compiles to a SQL WHERE
   * clause the in-browser DuckDB runs; `ViewState` is mostly rendering instructions —
   * `projection`, `x`, `y`, `colour` and `size` have no SQL meaning at all. The map also
   * reads its points from the coordinates artifact rather than from the catalog query
   * `toWhere()` targets. Share presentation, not state.
   */
  import type { Snippet } from 'svelte';
  import RailGroup from '$lib/catalog/rail/RailGroup.svelte';
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import { MIN_RATINGS_FLOOR, type ColourBy, type Projection, type SizeBy, type ViewState } from './view';

  let {
    view = $bindable(),
    /** Ratings thresholds the select offers, from the page (it owns the working-set floor). */
    minRatingsSteps,
    /** Components the artifact actually carries — 1..k. */
    components,
    /**
     * The publish-year scrubber. Its state (play/pause loop, `upTo`, tick speed) belongs to
     * the page — the map layer reads `upTo` too — so the rail takes it as a snippet and only
     * decides where it sits. Always open rather than in a `RailGroup`: it is something you
     * scrub and watch, and collapsing it would hide the affordance that makes it
     * discoverable at all.
     */
    timeline,
    /** Whether the year scrubber is narrowing the set — it counts toward the Filters badge. */
    yearActive = false
  }: {
    view: ViewState;
    minRatingsSteps: number[];
    components: number[];
    timeline?: Snippet;
    yearActive?: boolean;
  } = $props();

  const groupOpen = $state({ projection: false, filters: false });

  const axisBadge = $derived(
    view.projection === 'pca'
      ? `PC${view.x}×PC${view.y}`
      : view.projection === 'strip'
        ? `PC${view.x}`
        : 'UMAP'
  );

  /**
   * What a shut Filters row has to account for. The lasso's kept set counts here too — it is
   * a filter like any other, and the point of moving it into the rail is that you can see it
   * is on without remembering you drew it.
   */
  const filterCount = $derived(
    (view.minRatings > MIN_RATINGS_FLOOR ? 1 : 0) +
      (view.upcoming ? 1 : 0) +
      (view.categories ? 1 : 0) +
      (yearActive ? 1 : 0)
  );

  const COLOURS: { value: ColourBy; label: string }[] = [
    { value: 'weight', label: 'Weight' },
    { value: 'geek', label: 'Geek' },
    { value: 'rating', label: 'Rating' },
    { value: 'year', label: 'Year' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'category', label: 'Category' }
  ];
</script>

<aside class="rail">
  <!-- Order carries the grouping, not headings. How the map is drawn comes first (Colour,
       Size, Projection), then a rule, then which games are on it (the year scrubber, the
       rest of the filters). A DISPLAY heading in the rail's own label style sat directly
       above COLOUR in that same style and read as a second control rather than a section;
       making it louder instead made it foreign to the rail. The break is structural, so it
       is drawn structurally. -->
  <div class="grp top">
    <!-- Six options is past what a segmented row holds at 16rem, so this one keeps a select —
         the house uses segments for small sets, not for every set. -->
    <label class="field">
      <span class="lbl">Colour</span>
      <select bind:value={view.colour}>
        {#each COLOURS as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
      </select>
    </label>
  </div>

  <div class="grp">
    <SegGroup
      label="Size"
      options={[
        { value: 'popularity' as SizeBy, label: 'Popularity' },
        { value: 'uniform' as SizeBy, label: 'Uniform' }
      ]}
      value={view.size}
      onchange={(v) => (view = { ...view, size: v })}
    />
    <p class="note">
      {view.size === 'popularity'
        ? 'Dot size is how many people have rated it.'
        : 'One size for every game — colour is the only encoding left to read.'}
    </p>
  </div>

  <RailGroup title="Projection" badge={axisBadge} bind:open={groupOpen.projection}>
    <SegGroup
      two
      ariaLabel="Projection"
      options={[
        { value: 'pca' as Projection, label: 'PCA' },
        { value: 'umap' as Projection, label: 'UMAP' },
        { value: 'strip' as Projection, label: 'Strip' }
      ]}
      value={view.projection}
      onchange={(v) => (view = { ...view, projection: v })}
    />
    {#if view.projection === 'pca' || view.projection === 'strip'}
      <label class="field">
        <span class="lbl sm">{view.projection === 'strip' ? 'Component' : 'X axis'}</span>
        <select bind:value={view.x}>
          {#each components as c (c)}
            <option value={c} disabled={view.projection === 'pca' && c === view.y}>PC{c}</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if view.projection === 'pca'}
      <label class="field">
        <span class="lbl sm">Y axis</span>
        <select bind:value={view.y}>
          {#each components as c (c)}
            <option value={c} disabled={c === view.x}>PC{c}</option>
          {/each}
        </select>
      </label>
    {/if}
    <p class="note">
      {view.projection === 'pca'
        ? 'Two components of the embedding, plotted against each other. PC1 tracks complexity.'
        : view.projection === 'umap'
          ? 'A 2-D layout of the full 64-d space — neighbourhoods, not axes.'
          : 'One component on x, games jittered on y — a dimension read on its own.'}
    </p>
  </RailGroup>

  {#if timeline}
    <div class="grp break">
      <span class="lbl">Published up to</span>
      {@render timeline()}
    </div>
  {/if}

  <RailGroup title="Filters" badge={filterCount} bind:open={groupOpen.filters}>
    <label class="field">
      <span class="lbl sm">Min ratings</span>
      <select bind:value={view.minRatings}>
        {#each minRatingsSteps as r (r)}<option value={r}>{r.toLocaleString()}</option>{/each}
        {#if !minRatingsSteps.includes(view.minRatings)}
          <option value={view.minRatings}>{view.minRatings.toLocaleString()}</option>
        {/if}
      </select>
    </label>

    <label class="check">
      <input type="checkbox" bind:checked={view.upcoming} />
      Show upcoming games
    </label>

    {#if view.categories}
      <button type="button" class="chip" onclick={() => (view = { ...view, categories: null })}>
        {view.categories.length}
        {view.categories.length === 1 ? 'category' : 'categories'} kept ×
      </button>
    {/if}
  </RailGroup>
</aside>

<style>
  /* No card chrome: the rail is a column of controls, not content — the section rules carry
     the structure. Matches catalog/Rail.svelte, whose comment explains the reasoning. */
  .rail {
    padding-right: var(--space-sm);
    font-size: 0.85rem;
    overflow-y: auto;
    min-height: 0;
  }

  .grp {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--border);
  }
  .grp.top {
    border-top: none;
  }

  /* The seam between how-it-is-drawn and which-games-are-on-it: more air than the rules
     between groups, so the rail reads as two runs without either one needing a name. */
  .grp.break {
    margin-top: var(--space-md);
    border-top-width: 2px;
  }

  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    font-weight: 600;
  }
  .lbl.sm {
    font-size: 0.68rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .field select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.35rem 0.5rem;
    font: inherit;
    font-size: 0.85rem;
  }
  /* iOS Safari zooms the page when a focused input computes under 16px and does not zoom back
     out on blur. The rail's density is a desktop affordance, so the floor only applies where
     the problem exists. */
  @media (max-width: 40rem) {
    .field select {
      font-size: var(--input-font-min);
    }
  }

  .note {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    line-height: 1.35;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .chip {
    align-self: flex-start;
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--foreground);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
</style>
