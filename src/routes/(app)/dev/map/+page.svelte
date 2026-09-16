<script lang="ts">
  /**
   * `/dev/map` — the free-exploration embedding map. Controls strip, the canvas, a detail
   * panel on selection, a footer with what's plotted and which model it is. Everything in
   * the controls is mirrored to the URL so a view can be shared and reopened.
   *
   * All user-facing strings here are PLACEHOLDER — Phil writes the copy.
   */
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { fromParams, toParams, DEFAULT_VIEW, MIN_RATINGS_FLOOR, type ViewState } from '$lib/map/view';
  import { ANCHORS } from '$lib/map/anchors';
  import EmbeddingMap from '$lib/map/EmbeddingMap.svelte';
  import EmbeddingMapCanvas from '$lib/map/EmbeddingMapCanvas.svelte';

  // Renderer A/B while choosing: WebGL (regl-scatterplot) vs the hand-drawn 2-D canvas.
  // Not view state — `?r=canvas` is a comparison switch, not something to share.
  let renderer = $state<'webgl' | 'canvas'>('webgl');
  let mode = $state<'pan' | 'lasso'>('pan');

  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let loadError = $state<string | null>(null);
  let view = $state<ViewState>({ ...DEFAULT_VIEW });
  let hydrated = $state(false);

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const loaded = await loadMap();
      coords = loaded.coords;
      facts = loaded.facts;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // Same shape as /games: read the URL on every navigation that lands here, mirror the view
  // back with replaceState (no navigation, no history spam).
  afterNavigate(() => {
    const params = new URLSearchParams(location.search);
    renderer = params.get('r') === 'canvas' ? 'canvas' : 'webgl';
    view = fromParams(params, coords?.k ?? 6);
    hydrated = true;
  });
  $effect(() => {
    if (!hydrated) return;
    const p = toParams(view);
    if (renderer === 'canvas') p.set('r', 'canvas');
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });

  const k = $derived(coords?.k ?? 6);
  const components = $derived(Array.from({ length: k }, (_, i) => i + 1));

  // --- selection & detail ------------------------------------------------------------
  const selectedIdx = $derived(coords && view.selected != null ? (coords.index.get(view.selected) ?? -1) : -1);
  /** A searched-for game the catalog knows but the artifact lacks — "not yet placed". */
  let unplaced = $state<{ id: number; name: string } | null>(null);

  function select(id: number | null) {
    view = { ...view, selected: id };
    unplaced = null;
  }

  // --- legend filter -------------------------------------------------------------------
  /** Click a swatch: keep only it; click more to add; click the last one standing to release. */
  function toggleCategory(code: number) {
    const cur = view.categories;
    let next: number[] | null;
    if (cur == null) next = [code];
    else if (cur.includes(code)) next = cur.length === 1 ? null : cur.filter((c) => c !== code);
    else next = [...cur, code].sort((a, b) => a - b);
    view = { ...view, categories: next };
  }

  // --- lasso → table -------------------------------------------------------------------
  let lassoIds = $state<number[]>([]);
  type SortKey = 'name' | 'year' | 'weight' | 'geek' | 'ratings' | 'category';
  let sortKey = $state<SortKey>('ratings');
  let sortDir = $state<1 | -1>(-1);
  function sortBy(k: SortKey) {
    if (sortKey === k) sortDir = sortDir === 1 ? -1 : 1;
    else { sortKey = k; sortDir = k === 'name' || k === 'category' ? 1 : -1; }
  }
  const lassoRows = $derived.by(() => {
    if (!coords || !facts) return [];
    const c = coords, f = facts;
    const rows = lassoIds
      .map((id) => c.index.get(id))
      .filter((i): i is number => i != null)
      .map((i) => ({
        id: c.ids[i],
        name: f.name(c.ids[i]),
        year: f.year[i] || null,
        weight: f.weight[i] || null,
        geek: f.geekRating[i] || null,
        ratings: f.usersRated[i],
        category: f.categoryLabels[f.category[i]]
      }));
    const key = sortKey;
    rows.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
    return rows;
  });

  // --- search ------------------------------------------------------------------------
  let q = $state('');
  let hits = $state<{ game_id: number; name: string; year_published: number | null }[]>([]);
  let searchTimer = 0;
  function onsearch() {
    clearTimeout(searchTimer);
    const term = q.trim();
    if (term.length < 2) { hits = []; return; }
    searchTimer = window.setTimeout(async () => {
      const esc = term.replace(/'/g, "''").replace(/[%_]/g, '');
      hits = await query(
        `SELECT game_id, name, year_published FROM catalog
         WHERE name ILIKE '%${esc}%'
         ORDER BY users_rated DESC LIMIT 8`
      );
    }, 120);
  }
  function pick(hit: { game_id: number; name: string }) {
    q = '';
    hits = [];
    if (coords?.index.has(hit.game_id)) select(hit.game_id);
    else { view = { ...view, selected: null }; unplaced = hit ? { id: hit.game_id, name: hit.name } : null; }
  }

  const plotted = $derived.by(() => {
    if (!coords || !facts) return 0;
    let n = 0;
    for (let i = 0; i < coords.ids.length; i++) {
      const up = facts.upcoming[i] === 1;
      if (up ? view.upcoming : facts.usersRated[i] >= view.minRatings) n++;
    }
    return n;
  });

  // Min-ratings steps. A slider was tried and was hard to hit; a short list is enough.
  const MIN_RATINGS_STEPS = [MIN_RATINGS_FLOOR, 50, 100, 250, 500, 1000];
</script>

<svelte:head>
  <title>Embedding map — dev only</title>
</svelte:head>

<div class="page">
  <header class="top">
    <div>
      <p class="eyebrow">Dev only — never built into production</p>
      <h1>Embedding map</h1>
    </div>
    <div class="search">
      <input
        type="search"
        placeholder="Find a game…"
        bind:value={q}
        oninput={onsearch}
        aria-label="Find a game"
      />
      {#if hits.length}
        <ul class="hits" role="listbox">
          {#each hits as h (h.game_id)}
            <li><button type="button" onclick={() => pick(h)}>{h.name} <span>{h.year_published ?? ''}</span></button></li>
          {/each}
        </ul>
      {/if}
    </div>
  </header>

  <div class="controls">
    <label>Projection
      <select bind:value={view.projection}>
        <option value="pca">PCA</option>
        <option value="umap">UMAP</option>
      </select>
    </label>
    {#if view.projection === 'pca'}
      <label>X
        <select bind:value={view.x}>
          {#each components as c (c)}<option value={c} disabled={c === view.y}>PC{c}</option>{/each}
        </select>
      </label>
      <label>Y
        <select bind:value={view.y}>
          {#each components as c (c)}<option value={c} disabled={c === view.x}>PC{c}</option>{/each}
        </select>
      </label>
    {/if}
    <label>Colour
      <select bind:value={view.colour}>
        <option value="weight">Weight</option>
        <option value="geek">Geek rating</option>
        <option value="rating">Average rating</option>
        <option value="year">Year</option>
        <option value="upcoming">Upcoming</option>
        <option value="category">Category</option>
      </select>
    </label>
    <label>Size
      <select bind:value={view.size}>
        <option value="popularity">Popularity</option>
        <option value="uniform">Uniform</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={view.upcoming} /> Upcoming
    </label>
    <div class="seg" role="group" aria-label="Drag mode">
      <button type="button" class:on={mode === 'pan'} onclick={() => (mode = 'pan')}>Pan</button>
      <button type="button" class:on={mode === 'lasso'} onclick={() => (mode = 'lasso')}>Lasso</button>
    </div>
    {#if view.categories}
      <button type="button" class="chip" onclick={() => (view = { ...view, categories: null })}>
        {view.categories.length} {view.categories.length === 1 ? 'category' : 'categories'} kept ×
      </button>
    {/if}
    <label>Renderer
      <select bind:value={renderer}>
        <option value="webgl">WebGL</option>
        <option value="canvas">Canvas</option>
      </select>
    </label>
    <label>Min ratings
      <select bind:value={view.minRatings}>
        {#each MIN_RATINGS_STEPS as r (r)}<option value={r}>{r.toLocaleString()}</option>{/each}
        {#if !MIN_RATINGS_STEPS.includes(view.minRatings)}
          <option value={view.minRatings}>{view.minRatings.toLocaleString()}</option>
        {/if}
      </select>
    </label>
  </div>

  <div class="body">
    <div class="map">
      {#if loadError}
        <div class="state error">Couldn’t load the map: {loadError}</div>
      {:else if !coords || !facts}
        <div class="state">Loading {catalog.status === 'ready' ? 'coordinates' : 'catalog'}…</div>
      {:else}
        {#if renderer === 'canvas'}
          <EmbeddingMapCanvas {coords} {facts} {view} anchors={ANCHORS} onselect={select} />
        {:else}
          <EmbeddingMap
            {coords}
            {facts}
            {view}
            anchors={ANCHORS}
            {mode}
            keep={lassoIds.length ? lassoIds : null}
            onselect={select}
            onlasso={(ids) => (lassoIds = ids)}
            ontogglecategory={toggleCategory}
          />
        {/if}
      {/if}
    </div>

    {#if coords && facts && (selectedIdx >= 0 || unplaced)}
      <aside class="detail">
        {#if selectedIdx >= 0}
          {@const id = coords.ids[selectedIdx]}
          <button class="close" type="button" onclick={() => select(null)} aria-label="Close">×</button>
          <h2>{facts.name(id)}</h2>
          <dl>
            <dt>Year</dt><dd>{facts.year[selectedIdx] || '—'}</dd>
            <dt>Weight</dt><dd>{facts.weight[selectedIdx] ? facts.weight[selectedIdx].toFixed(2) : '—'}</dd>
            <dt>Geek rating</dt><dd>{facts.geekRating[selectedIdx] ? facts.geekRating[selectedIdx].toFixed(2) : '—'}</dd>
            <dt>Avg rating</dt><dd>{facts.averageRating[selectedIdx] ? facts.averageRating[selectedIdx].toFixed(2) : '—'}</dd>
            <dt>Ratings</dt><dd>{facts.usersRated[selectedIdx].toLocaleString()}</dd>
            <dt>Category</dt><dd>{facts.categoryLabels[facts.category[selectedIdx]]}</dd>
            {#if view.projection === 'pca'}
              <dt>PC{view.x}</dt><dd>{coords.pcs[view.x - 1][selectedIdx].toFixed(2)}</dd>
              <dt>PC{view.y}</dt><dd>{coords.pcs[view.y - 1][selectedIdx].toFixed(2)}</dd>
            {:else}
              <dt>UMAP</dt><dd>{coords.umap[0][selectedIdx].toFixed(2)}, {coords.umap[1][selectedIdx].toFixed(2)}</dd>
            {/if}
          </dl>
          <a href="/games/{id}">Open game page →</a>
        {:else if unplaced}
          <button class="close" type="button" onclick={() => (unplaced = null)} aria-label="Close">×</button>
          <h2>{unplaced.name}</h2>
          <p class="muted">Not placed yet — this game has no coordinates in the current embedding.</p>
          <a href="/games/{unplaced.id}">Open game page →</a>
        {/if}
      </aside>
    {/if}
  </div>

  {#if lassoRows.length}
    <section class="lasso">
      <header>
        <strong>{lassoRows.length.toLocaleString()} games kept from the lasso</strong>
        <button type="button" class="chip" onclick={() => (lassoIds = [])}>Clear ×</button>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              {#each [['name', 'Game'], ['year', 'Year'], ['weight', 'Weight'], ['geek', 'Geek'], ['ratings', 'Ratings'], ['category', 'Category']] as [k, label] (k)}
                <th class:active={sortKey === k} onclick={() => sortBy(k as SortKey)}>
                  {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each lassoRows as r (r.id)}
              <tr class:selected={view.selected === r.id} onclick={() => select(r.id)}>
                <td><a href="/games/{r.id}" onclick={(e) => e.stopPropagation()}>{r.name}</a></td>
                <td>{r.year ?? '—'}</td>
                <td>{r.weight?.toFixed(2) ?? '—'}</td>
                <td>{r.geek?.toFixed(2) ?? '—'}</td>
                <td>{r.ratings.toLocaleString()}</td>
                <td>{r.category}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <footer class="foot">
    {#if coords && facts}
      {plotted.toLocaleString()} games plotted
      · {(coords.ids.length - plotted).toLocaleString()} hidden by filters
      · {facts.missing.toLocaleString()} without coordinates
      · model {coords.model} v{coords.version} · {coords.k} components
      · anchors: {ANCHORS.length}
    {/if}
  </footer>
</div>

<style>
  .page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
  .eyebrow { color: var(--muted-foreground); font-size: 0.8rem; margin: 0; }
  h1 { margin: 0; }

  .search { position: relative; min-width: min(20rem, 100%); }
  .search input { width: 100%; }
  .hits {
    position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 0.25rem);
    margin: 0; padding: 0.25rem; list-style: none;
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: 0 4px 16px oklch(0 0 0 / 0.12);
  }
  .hits button {
    width: 100%; text-align: left; padding: 0.35rem 0.5rem; border: 0; background: none;
    color: var(--foreground); cursor: pointer; border-radius: 0.25rem;
    display: flex; justify-content: space-between; gap: 1rem;
  }
  .hits button:hover, .hits button:focus-visible { background: var(--muted); }
  .hits span { color: var(--muted-foreground); }

  .controls {
    display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: center;
    color: var(--muted-foreground); font-size: 0.85rem;
  }
  .controls label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .controls select { color: var(--foreground); }
  .controls strong { color: var(--foreground); font-variant-numeric: tabular-nums; }

  .body {
    flex: 1 1 auto; min-height: 20rem;
    display: flex; gap: var(--space-md);
  }
  .map { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; }
  .state {
    position: absolute; inset: 0; display: grid; place-items: center;
    color: var(--muted-foreground);
  }
  .state.error { color: var(--destructive, var(--foreground)); }

  .detail {
    flex: 0 0 18rem; position: relative;
    padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); overflow: auto;
  }
  .detail h2 { margin: 0 1.5rem 0.5rem 0; font-size: 1.1rem; }
  .detail dl { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.8rem; margin: 0 0 0.8rem; }
  .detail dt { color: var(--muted-foreground); }
  .detail dd { margin: 0; font-variant-numeric: tabular-nums; }
  .detail a { color: var(--primary); }
  .detail .muted { color: var(--muted-foreground); }
  .close {
    position: absolute; top: 0.4rem; right: 0.4rem;
    border: 0; background: none; color: var(--muted-foreground); font-size: 1.2rem; cursor: pointer;
  }

  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .seg button {
    border: 0; background: var(--background); color: var(--muted-foreground);
    padding: 0.2rem 0.7rem; font: inherit; font-size: 0.8rem; cursor: pointer;
  }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button.on { background: var(--muted); color: var(--foreground); }

  .chip {
    border: 1px solid var(--border); background: var(--muted); color: var(--foreground);
    border-radius: 999px; padding: 0.15rem 0.6rem; font: inherit; font-size: 0.8rem; cursor: pointer;
  }

  .lasso {
    flex: 0 0 auto; max-height: 40%; min-height: 0;
    display: flex; flex-direction: column; gap: var(--space-sm);
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
    padding: var(--space-sm) var(--space-md);
  }
  .lasso header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
  .table-wrap { overflow: auto; min-height: 0; }
  .lasso table { width: 100%; border-collapse: collapse; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .lasso th {
    position: sticky; top: 0; background: var(--card); text-align: left; padding: 0.3rem 0.5rem;
    color: var(--muted-foreground); font-weight: 600; cursor: pointer; user-select: none; white-space: nowrap;
  }
  .lasso th.active { color: var(--foreground); }
  .lasso td { padding: 0.25rem 0.5rem; border-top: 1px solid var(--border); white-space: nowrap; }
  .lasso td:first-child { white-space: normal; }
  .lasso tbody tr { cursor: pointer; }
  .lasso tbody tr:hover { background: var(--muted); }
  .lasso tbody tr.selected { background: color-mix(in oklch, var(--primary) 14%, transparent); }
  .lasso a { color: var(--primary); text-decoration: none; }
  .lasso a:hover { text-decoration: underline; }

  .foot { color: var(--muted-foreground); font-size: 0.8rem; min-height: 1.2em; }

  @container (max-width: 44rem) {
    .body { flex-direction: column; }
    .detail { flex: none; }
  }
</style>
