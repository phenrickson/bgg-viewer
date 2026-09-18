<script lang="ts">
  /**
   * `/dev/map` — the free-exploration embedding map. Controls strip, the map, a table of the
   * selected games below it, a footer with what's plotted and which model it is. Everything
   * in the controls (and the selection, capped) is mirrored to the URL so a view can be
   * shared and reopened.
   *
   * One selection model: a list of games, built by clicking points (toggle), lassoing
   * (adds), or searching (adds). Selected games are ringed on the map and listed in the
   * table — the table is the only place a selected game's details appear.
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

  // --- selection -----------------------------------------------------------------------
  /** A searched-for game the catalog knows but the artifact lacks — "not yet placed". */
  let unplaced = $state<{ id: number; name: string } | null>(null);
  /** Opt-in: hide everything but the selection. Off by default — selecting highlights. */
  let keepOnly = $state(false);

  function setSelection(ids: number[]) {
    view = { ...view, selected: ids };
    if (ids.length === 0) keepOnly = false;
  }
  function removeFromSelection(id: number) {
    setSelection(view.selected.filter((x) => x !== id));
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

  // --- selection table -----------------------------------------------------------------
  type SortKey = 'name' | 'year' | 'weight' | 'geek' | 'ratings' | 'category';
  let sortKey = $state<SortKey>('ratings');
  let sortDir = $state<1 | -1>(-1);
  function sortBy(k: SortKey) {
    if (sortKey === k) sortDir = sortDir === 1 ? -1 : 1;
    else { sortKey = k; sortDir = k === 'name' || k === 'category' ? 1 : -1; }
  }
  const rows = $derived.by(() => {
    if (!coords || !facts) return [];
    const c = coords, f = facts;
    const rows = view.selected
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
    if (coords?.index.has(hit.game_id)) {
      unplaced = null;
      if (!view.selected.includes(hit.game_id)) setSelection([...view.selected, hit.game_id]);
    } else unplaced = { id: hit.game_id, name: hit.name };
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

  // --- timeline ----------------------------------------------------------------------
  // Games appear as the clock passes their publication year. The clock is continuous
  // (a fraction of a year per frame, `tickMs` per year) and the layer grows a year's
  // games in over that span, so the fill-in flows instead of stepping.
  const TIMELINE_START = 1980, TIMELINE_END = new Date().getFullYear();
  let tickMs = $state(350);
  let upTo = $state<number | null>(null);
  let playing = $state(false);
  let raf = 0;
  function play() {
    if (upTo == null || upTo >= TIMELINE_END) upTo = TIMELINE_START;
    playing = true;
    cancelAnimationFrame(raf);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100); // a background tab shouldn't leap
      last = now;
      upTo = Math.min(TIMELINE_END, (upTo ?? TIMELINE_START) + dt / tickMs);
      if (upTo >= TIMELINE_END) { pause(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function pause() { playing = false; cancelAnimationFrame(raf); }
  function stopTimeline() { pause(); upTo = null; }
  $effect(() => () => cancelAnimationFrame(raf));
  const shownYear = $derived(upTo == null ? null : Math.floor(upTo));
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
        <option value="strip">Strip</option>
      </select>
    </label>
    {#if view.projection === 'pca' || view.projection === 'strip'}
      <label>{view.projection === 'strip' ? 'PC' : 'X'}
        <select bind:value={view.x}>
          {#each components as c (c)}<option value={c} disabled={view.projection === 'pca' && c === view.y}>PC{c}</option>{/each}
        </select>
      </label>
    {/if}
    {#if view.projection === 'pca'}
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
    <label>Min ratings
      <select bind:value={view.minRatings}>
        {#each MIN_RATINGS_STEPS as r (r)}<option value={r}>{r.toLocaleString()}</option>{/each}
        {#if !MIN_RATINGS_STEPS.includes(view.minRatings)}
          <option value={view.minRatings}>{view.minRatings.toLocaleString()}</option>
        {/if}
      </select>
    </label>
    <div class="timeline">
      <button type="button" class="chip" onclick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
      <input
        type="range"
        min={TIMELINE_START}
        max={TIMELINE_END}
        value={shownYear ?? TIMELINE_END}
        oninput={(e) => { pause(); upTo = +e.currentTarget.value; }}
        aria-label="Published up to"
      />
      <span class="year">{shownYear ?? 'all years'}</span>
      <label class="tick"><input type="number" min="20" max="5000" step="10" bind:value={tickMs} aria-label="Tick speed, milliseconds per year" /> ms/yr</label>
      {#if upTo != null}<button type="button" class="chip" onclick={stopTimeline}>×</button>{/if}
    </div>
  </div>

  <div class="body">
    <div class="map">
      {#if loadError}
        <div class="state error">Couldn’t load the map: {loadError}</div>
      {:else if !coords || !facts}
        <div class="state">Loading {catalog.status === 'ready' ? 'coordinates' : 'catalog'}…</div>
      {:else}
        <EmbeddingMap
          {coords}
          {facts}
          {view}
          anchors={ANCHORS}
          {upTo}
          {mode}
          keep={keepOnly && view.selected.length ? view.selected : null}
          onselectionchange={setSelection}
          ontogglecategory={toggleCategory}
        />
      {/if}
    </div>
  </div>

  {#if unplaced}
    <p class="notice">
      <strong>{unplaced.name}</strong> isn’t placed yet — no coordinates in the current embedding.
      <a href="/games/{unplaced.id}">Open game page →</a>
      <button type="button" class="chip" onclick={() => (unplaced = null)}>×</button>
    </p>
  {/if}

  {#if rows.length}
    <section class="lasso">
      <header>
        <strong>{rows.length.toLocaleString()} {rows.length === 1 ? 'game' : 'games'} selected</strong>
        <span class="actions">
          <button type="button" class="chip" class:on={keepOnly} onclick={() => (keepOnly = !keepOnly)}>
            {keepOnly ? 'Showing only these' : 'Show only these'}
          </button>
          <button type="button" class="chip" onclick={() => setSelection([])}>Clear ×</button>
        </span>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.id)}
              <tr>
                <td><a href="/games/{r.id}">{r.name}</a></td>
                <td>{r.year ?? '—'}</td>
                <td>{r.weight?.toFixed(2) ?? '—'}</td>
                <td>{r.geek?.toFixed(2) ?? '—'}</td>
                <td>{r.ratings.toLocaleString()}</td>
                <td>{r.category}</td>
                <td><button type="button" class="remove" onclick={() => removeFromSelection(r.id)} aria-label="Remove from selection">×</button></td>
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
  .timeline { display: inline-flex; align-items: center; gap: 0.4rem; }
  .timeline input { width: 9rem; }
  .timeline .tick input { width: 4.5rem; }
  .timeline .year { min-width: 4.5rem; font-variant-numeric: tabular-nums; color: var(--foreground); }

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

  .notice {
    margin: 0; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    color: var(--muted-foreground); font-size: 0.85rem;
  }
  .notice a { color: var(--primary); }

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
  .lasso .actions { display: inline-flex; gap: 0.4rem; }
  .lasso .chip.on { background: color-mix(in oklch, var(--primary) 18%, var(--muted)); }
  .lasso tbody tr:hover { background: var(--muted); }
  .remove { border: 0; background: none; color: var(--muted-foreground); cursor: pointer; font-size: 1rem; line-height: 1; }
  .remove:hover { color: var(--foreground); }
  .lasso a { color: var(--primary); text-decoration: none; }
  .lasso a:hover { text-decoration: underline; }

  .foot { color: var(--muted-foreground); font-size: 0.8rem; min-height: 1.2em; }

  @container (max-width: 44rem) {
    .body { flex-direction: column; }
  }
</style>
