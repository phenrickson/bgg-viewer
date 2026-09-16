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
    view = fromParams(new URLSearchParams(location.search), coords?.k ?? 6);
    hydrated = true;
  });
  $effect(() => {
    if (!hydrated) return;
    const qs = toParams(view).toString();
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

  // log-scale slider for min ratings: 30 … 30,000
  const R_LO = Math.log(MIN_RATINGS_FLOOR), R_HI = Math.log(30_000);
  const sliderPos = $derived(((Math.log(view.minRatings) - R_LO) / (R_HI - R_LO)) * 100);
  function onslider(e: Event) {
    const t = Number((e.currentTarget as HTMLInputElement).value) / 100;
    const v = Math.round(Math.exp(R_LO + t * (R_HI - R_LO)));
    view = { ...view, minRatings: t <= 0 ? MIN_RATINGS_FLOOR : v };
  }
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
        <option value="year">Year</option>
        <option value="upcoming">Upcoming</option>
        <option value="category">Category</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={view.upcoming} /> Upcoming
    </label>
    <label class="range">Min ratings <strong>{view.minRatings.toLocaleString()}</strong>
      <input type="range" min="0" max="100" value={sliderPos} oninput={onslider} />
    </label>
  </div>

  <div class="body">
    <div class="map">
      {#if loadError}
        <div class="state error">Couldn’t load the map: {loadError}</div>
      {:else if !coords || !facts}
        <div class="state">Loading {catalog.status === 'ready' ? 'coordinates' : 'catalog'}…</div>
      {:else}
        <EmbeddingMap {coords} {facts} {view} anchors={ANCHORS} onselect={select} />
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
  .controls .range { gap: 0.6rem; }
  .controls .range input { width: 10rem; }
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

  .foot { color: var(--muted-foreground); font-size: 0.8rem; min-height: 1.2em; }

  @container (max-width: 44rem) {
    .body { flex-direction: column; }
    .detail { flex: none; }
  }
</style>
