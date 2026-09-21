<script lang="ts">
  /**
   * The map's scope rail — the same doctrine as the catalog's `Rail.svelte`, applied to
   * `ViewState`.
   *
   * The map's controls used to be fifteen items in one flex-wrap strip, every one at equal
   * weight. That is right for a bench with one user who wants everything a click away, and
   * wrong for a feature: it wraps unpredictably, affords no grouping, and tells a first-time
   * visitor that choosing a principal component is as ordinary as choosing a colour. The fix
   * is the one Rail already found — priority, not fewer capabilities:
   *
   *   1. **Always open** — Colour and Size. What you reach for first, and what changes what
   *      you are looking at rather than which games are in view.
   *   2. **Collapsed, counted** — Projection (with its axis pair) and Filters. A shut
   *      `<details>` with a badge is one line and still says what it is set to, so PC3–PC6
   *      stop shouting at a general visitor while staying one click away.
   *   3. **Moved to the canvas toolbar** — Pan/Lasso, Export, the timeline, search. Those act
   *      on the current view, not on its scope, and the timeline needs more width than a
   *      16rem rail has.
   *
   * This deliberately does NOT reuse `Rail.svelte` or `Scope`. `Scope` compiles to a SQL
   * WHERE clause the in-browser DuckDB runs; `ViewState` is mostly rendering instructions —
   * `projection`, `x`, `y`, `colour` and `size` have no SQL meaning at all. Only `minRatings`
   * and `upcoming` are scope-shaped, and `Scope` already carries richer equivalents. The map
   * also reads its points from the coordinates artifact rather than from the catalog query
   * `toWhere()` targets. What the two rails share is the doctrine and the chrome, not a state
   * model.
   *
   * `<details>` does the collapsing natively, so it is keyboard- and screen-reader-correct
   * with no JS.
   */
  import { MIN_RATINGS_FLOOR, type ViewState } from './view';

  let {
    view = $bindable(),
    /** Ratings thresholds the select offers, from the page (it owns the working-set floor). */
    minRatingsSteps,
    /** Components the artifact actually carries — 1..k. */
    components
  }: { view: ViewState; minRatingsSteps: number[]; components: number[] } = $props();

  /**
   * `bind:open`, never `<details {open}>`. The latter compiles to `details.open = open()`
   * inside the render effect, which re-asserts the prop every time that effect reruns and
   * slams the group shut as you interact with anything it reads. Rail.svelte hit this exact
   * bug; see its note.
   */
  const groupOpen = $state({ projection: false, filters: false });

  const axisLabel = $derived(
    view.projection === 'pca'
      ? `PCA · PC${view.x}×PC${view.y}`
      : view.projection === 'strip'
        ? `Strip · PC${view.x}`
        : 'UMAP'
  );

  /**
   * What a shut Filters row has to account for. The lasso's kept set counts here too — it is
   * a filter like any other, and the whole point of moving it into the rail is that you can
   * see it is on without remembering you drew it.
   */
  const filterCount = $derived(
    (view.minRatings > MIN_RATINGS_FLOOR ? 1 : 0) +
      (view.upcoming ? 1 : 0) +
      (view.categories ? 1 : 0)
  );
</script>

<div class="rail">
  <label class="field">
    <span class="lbl">Colour</span>
    <select bind:value={view.colour}>
      <option value="weight">Weight</option>
      <option value="geek">Geek rating</option>
      <option value="rating">Average rating</option>
      <option value="year">Year</option>
      <option value="upcoming">Upcoming</option>
      <option value="category">Category</option>
    </select>
  </label>

  <label class="field">
    <span class="lbl">Size</span>
    <select bind:value={view.size}>
      <option value="popularity">Popularity</option>
      <option value="uniform">Uniform</option>
    </select>
  </label>

  <details class="grp" bind:open={groupOpen.projection}>
    <summary>
      <span class="lbl">Projection</span>
      <span class="badge">{axisLabel}</span>
      <span class="chev" aria-hidden="true">›</span>
    </summary>
    <div class="dbody">
      <label class="field">
        <span class="lbl">Projection</span>
        <select bind:value={view.projection}>
          <option value="pca">PCA</option>
          <option value="umap">UMAP</option>
          <option value="strip">Strip</option>
        </select>
      </label>
      {#if view.projection === 'pca' || view.projection === 'strip'}
        <label class="field">
          <span class="lbl">{view.projection === 'strip' ? 'Component' : 'X axis'}</span>
          <select bind:value={view.x}>
            {#each components as c (c)}
              <option value={c} disabled={view.projection === 'pca' && c === view.y}>PC{c}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if view.projection === 'pca'}
        <label class="field">
          <span class="lbl">Y axis</span>
          <select bind:value={view.y}>
            {#each components as c (c)}
              <option value={c} disabled={c === view.x}>PC{c}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>
  </details>

  <details class="grp" bind:open={groupOpen.filters}>
    <summary>
      <span class="lbl">Filters</span>
      {#if filterCount}<span class="badge tnum">{filterCount}</span>{/if}
      <span class="chev" aria-hidden="true">›</span>
    </summary>
    <div class="dbody">
      <label class="field">
        <span class="lbl">Min ratings</span>
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
        <button
          type="button"
          class="chip"
          onclick={() => (view = { ...view, categories: null })}
        >
          {view.categories.length}
          {view.categories.length === 1 ? 'category' : 'categories'} kept ×
        </button>
      {/if}
    </div>
  </details>
</div>

<style>
  /* Chrome matched to catalog/Rail.svelte so the two rails read as one component. */
  .rail {
    display: flex;
    flex-direction: column;
    padding-right: var(--space-sm);
    font-size: 0.85rem;
    /* Its own scroll region: the rail must never stretch the workspace. */
    overflow-y: auto;
    min-height: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0;
  }
  .field select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.85rem;
  }

  .lbl {
    color: var(--muted-foreground);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0;
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

  details.grp {
    gap: 0;
    padding: 0;
  }
  details.grp summary {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0;
    cursor: pointer;
    list-style: none;
  }
  details.grp summary::-webkit-details-marker {
    display: none;
  }
  details.grp summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  details.grp summary:hover .lbl {
    color: var(--foreground);
  }
  .badge {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--primary);
    background: color-mix(in oklch, var(--primary) 15%, transparent);
    border-radius: 999px;
    padding: 0.02rem 0.35rem;
  }
  .chev {
    margin-left: auto;
    color: var(--muted-foreground);
    transition: transform 0.12s ease;
  }
  details.grp[open] .chev {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .dbody {
    display: flex;
    flex-direction: column;
    padding-bottom: 0.4rem;
  }
</style>
