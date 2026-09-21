<script lang="ts">
  /**
   * `/dev/map` — the free-exploration embedding map. A scope rail, the map, a table of the
   * selected games overlaying it, a count line above. Everything in the controls (and the
   * selection, capped) is mirrored to the URL so a view can be shared and reopened.
   *
   * Laid out like `/games`: `Container size="wide" fill` > `.workspace` > `.sidebar` +
   * `.canvas`, with the rail moving into a bottom sheet on narrow. A second full-page data
   * view that invented its own chrome was the inconsistency; see
   * docs/superpowers/plans/2026-09-21-embedding-map-site-integration.md.
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
  import MapRail from '$lib/map/MapRail.svelte';
  import { Container } from '$lib/components/ui/layout';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import type { CanvasApi } from '$lib/map/surface';

  /**
   * `matchMedia` rather than CSS: the rail has to be the SAME component instance whether it
   * is inline or in the sheet — the same reason `/games` does it this way.
   */
  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 60rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  let filtersOpen = $state(false);
  // Leaving narrow with the sheet open would strand a modal over a desktop layout.
  $effect(() => {
    if (!narrow) filtersOpen = false;
  });

  let mode = $state<'pan' | 'lasso'>('pan');

  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let loadError = $state<string | null>(null);
  let view = $state<ViewState>({ ...DEFAULT_VIEW });
  let hydrated = $state(false);

  /** What the narrow Filters trigger shows; mirrors MapRail's own badge. */
  const activeFilterCount = $derived(
    (view.minRatings > MIN_RATINGS_FLOOR ? 1 : 0) + (view.upcoming ? 1 : 0) + (view.categories ? 1 : 0)
  );

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

  // --- export ------------------------------------------------------------------------
  // What's on screen — camera, filters, selection rings and labels — as a PNG at a multiple
  // of the canvas size. 8× of a ~1400px canvas is ~11k px wide: print size.
  let api = $state<CanvasApi | null>(null);
  let exportOpen = $state(false);
  let exportScale = $state(4);
  let exportTitle = $state('');
  let exportTransparent = $state(false);
  let exporting = $state(false);
  let exportError = $state<string | null>(null);
  // Re-read when the panel opens (it depends on the canvas size at that moment).
  const maxScale = $derived(exportOpen && api ? api.maxExportScale() : 8);
  const exportPx = $derived.by(() => {
    if (!exportOpen || typeof document === 'undefined') return { w: 0, h: 0, mp: '0' };
    const el = document.querySelector('.map .host');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round((el?.clientWidth ?? 0) * exportScale * dpr), h = Math.round((el?.clientHeight ?? 0) * exportScale * dpr);
    return { w, h, mp: ((w * h) / 1e6).toFixed(1) };
  });
  async function exportPng() {
    if (!api) return;
    exporting = true; exportError = null;
    try {
      const blob = await api.exportPng({ scale: exportScale, title: exportTitle.trim() || undefined, transparent: exportTransparent });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const where = view.projection === 'pca' ? `pc${view.x}x${view.y}` : view.projection;
      a.download = `bgg-map-${where}-${view.colour}${upTo != null ? `-${shownYear}` : ''}@${exportScale}x.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      exportError = e instanceof Error ? e.message : String(e);
    } finally { exporting = false; }
  }
</script>

<svelte:head>
  <title>Embedding map — dev only</title>
</svelte:head>

<Container size="wide" fill>
  <div class="workspace" class:narrow>
    {#if !narrow}
      <aside class="sidebar">
        <MapRail bind:view minRatingsSteps={MIN_RATINGS_STEPS} {components} />
      </aside>
    {/if}

    <div class="canvas">
      <!-- The count in house style, then the view actions: search, mode, timeline, export.
           These act on the current view rather than on its scope, which is why they are here
           and not in the rail. -->
      <div class="chead">
        <p class="count">
          {#if coords && facts}
            <b class="tnum">{plotted.toLocaleString()}</b>
            <span>{plotted === 1 ? 'game' : 'games'}</span>
            {#if coords.ids.length - plotted > 0}
              <span class="dim">· <span class="tnum">{(coords.ids.length - plotted).toLocaleString()}</span> hidden by filters</span>
            {/if}
          {/if}
        </p>

        <div class="actions">
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

          {#if narrow}
            <Button size="sm" variant="outline" onclick={() => (filtersOpen = true)}>
              Filters{#if activeFilterCount}&nbsp;·&nbsp;{activeFilterCount}{/if}
            </Button>
          {/if}

          <div class="seg" role="group" aria-label="Drag mode">
            <button type="button" class:on={mode === 'pan'} onclick={() => (mode = 'pan')}>Pan</button>
            <button type="button" class:on={mode === 'lasso'} onclick={() => (mode = 'lasso')}>Lasso</button>
          </div>

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

          <button type="button" class="chip" class:on={exportOpen} onclick={() => (exportOpen = !exportOpen)}>Export</button>
          <span class="devbadge" title="This route is dev-only and 404s in production">dev</span>
        </div>
      </div>

  {#if exportOpen}
      <div class="export">
        <label>Scale
          <select bind:value={exportScale}>
            {#each [1, 2, 3, 4, 6, 8] as s (s)}<option value={s} disabled={s > maxScale}>{s}×{s > maxScale ? ' — over the WebGL size limit' : ''}</option>{/each}
          </select>
          <span class="muted">{exportPx.w} × {exportPx.h} px · {exportPx.mp} MP</span>
        </label>
        <label class="check"><input type="checkbox" bind:checked={exportTransparent} /> Transparent background</label>
        <label>Title <input type="text" bind:value={exportTitle} placeholder="optional, bottom-left" /></label>
        <button type="button" class="chip on" disabled={!api || exporting} onclick={exportPng}>{exporting ? 'Rendering…' : 'Download PNG'}</button>
        <span class="muted">Frame the shot first: the export is the current view, with the selection’s rings and labels.</span>
        {#if exportError}<span class="error">{exportError}</span>{/if}
      </div>
    {/if}

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
          bind:api
          keep={keepOnly && view.selected.length ? view.selected : null}
          onselectionchange={setSelection}
          ontogglecategory={toggleCategory}
        />
      {/if}
      {#if rows.length}
        <section class="lasso">
          <header>
            <strong>{rows.length.toLocaleString()} {rows.length === 1 ? 'game' : 'games'} selected</strong>
            <span class="actions">
              <!-- The lasso is a filter, so applying it gets the /games sheet's live-count
                   treatment rather than a chip that is easy to set and easy to forget. -->
              <button type="button" class="apply" class:on={keepOnly} onclick={() => (keepOnly = !keepOnly)}>
                {keepOnly ? 'Showing these only' : `Show ${rows.length.toLocaleString()} only`}
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
      </div>

      {#if unplaced}
        <p class="notice">
          <strong>{unplaced.name}</strong> isn’t placed yet — no coordinates in the current embedding.
          <a href="/games/{unplaced.id}">Open game page →</a>
          <button type="button" class="chip" onclick={() => (unplaced = null)}>×</button>
        </p>
      {/if}

      <!-- Provenance, not body copy: the model and the unplaced count are worth keeping and
           not worth a line of their own. The debug dump this replaced ("245 without
           coordinates · 6 components · anchors: 0") was written for one reader. -->
      {#if coords && facts}
        <p class="prov" title="model {coords.model} v{coords.version} · {coords.k} components · {facts.missing.toLocaleString()} games without coordinates · anchors: {ANCHORS.length}">
          {coords.model} v{coords.version}
        </p>
      {/if}
    </div>
  </div>
</Container>

<!-- Narrow: the rail becomes a bottom sheet you deliberately enter, the same call /games
     made and for the same reason. Left short of full height so a sliver of the map stays
     visible behind it. -->
<Sheet.Root bind:open={filtersOpen}>
  <Sheet.Content side="bottom" class="flex h-[92dvh] max-h-[92dvh] flex-col p-0">
    <Sheet.Header class="border-b border-border">
      <Sheet.Title>Display</Sheet.Title>
    </Sheet.Header>
    <div class="sheet-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <MapRail bind:view minRatingsSteps={MIN_RATINGS_STEPS} {components} />
    </div>
    <Sheet.Footer class="border-t border-border">
      <Button size="lg" class="w-full" onclick={() => (filtersOpen = false)}>
        Show {plotted.toLocaleString()} games
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<style>
  /* Width and fill-height belong to <Container size="wide" fill> — see layout/tokens.ts.
     Same grid as /games: a fixed rail and a canvas that takes what is left. */
  .workspace {
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    gap: var(--space-lg);
    height: 100%;
    min-height: 0;
  }
  .workspace.narrow { grid-template-columns: 1fr; }
  .sidebar { display: flex; flex-direction: column; min-height: 0; }
  .canvas {
    display: flex; flex-direction: column; gap: var(--space-sm);
    min-width: 0; min-height: 0;
  }

  /* Count left, view actions right. Wraps as one row of controls, not fifteen. */
  .chead {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-md); flex-wrap: wrap;
    color: var(--muted-foreground); font-size: 0.85rem;
  }
  .count { margin: 0; display: inline-flex; align-items: baseline; gap: 0.35rem; }
  .count b { font-size: 1.1rem; color: var(--foreground); font-weight: 700; }
  .count .dim { color: var(--muted-foreground); }
  .tnum { font-variant-numeric: tabular-nums; }
  .actions { display: inline-flex; align-items: center; gap: var(--space-md); flex-wrap: wrap; }

  /* A build-state fact, not a page title — it earns a badge, not a heading. */
  .devbadge {
    font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--muted-foreground);
    border: 1px solid var(--border); border-radius: 999px; padding: 0.02rem 0.4rem;
  }

  /* Provenance under the map, quiet; the full detail is in its title attribute. */
  .prov { margin: 0; color: var(--muted-foreground); font-size: 0.75rem; }

  .search { position: relative; min-width: min(16rem, 100%); }
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

  .export { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-md); font-size: 0.9rem; }
  .export label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .export input[type='text'] { width: 14rem; }
  .export .muted { color: var(--muted-foreground); font-size: 0.85rem; }
  .export .error { color: var(--destructive, var(--foreground)); font-size: 0.85rem; }
  .timeline { display: inline-flex; align-items: center; gap: 0.4rem; }
  .timeline input { width: 9rem; }
  .timeline .tick input { width: 4.5rem; }
  .timeline .year { min-width: 4.5rem; font-variant-numeric: tabular-nums; color: var(--foreground); }

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

  /**
   * Docked inside the canvas frame rather than stacked under it. As a sibling below the map
   * it mounted from zero and resized the canvas under the point you had just clicked, which
   * desynced regl's `getScreenPosition` (it scales by regl's own `currentWidth/Height`, and
   * our ResizeObserver repaints the overlay before regl's has updated them) — rings and
   * labels landed off their points. An overlay keeps the canvas a constant size, so the
   * resize, and the race, never happen.
   */
  .lasso {
    position: absolute; top: var(--space-sm); right: var(--space-sm);
    width: max-content; max-width: min(36rem, 48%);
    max-height: calc(100% - 2 * var(--space-sm));
    z-index: 2;
    display: flex; flex-direction: column; gap: var(--space-sm);
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.3);
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
  .lasso .actions { display: inline-flex; gap: 0.4rem; align-items: center; }
  .apply {
    border: 1px solid var(--primary); border-radius: var(--radius);
    background: var(--primary); color: var(--primary-foreground);
    padding: 0.2rem 0.7rem; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;
  }
  .apply.on { background: transparent; color: var(--primary); }
  .lasso tbody tr:hover { background: var(--muted); }
  .remove { border: 0; background: none; color: var(--muted-foreground); cursor: pointer; font-size: 1rem; line-height: 1; }
  .remove:hover { color: var(--foreground); }
  .lasso a { color: var(--primary); text-decoration: none; }
  .lasso a:hover { text-decoration: underline; }


</style>
