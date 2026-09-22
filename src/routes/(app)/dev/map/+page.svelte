<script lang="ts">
  /**
   * `/dev/map` — the board game landscape.
   *
   * Every game the embedding places is drawn, always. Filtering does not remove points, it
   * **lights** them: the games in scope keep their colour and the rest fade toward the
   * background. That is the one thing this page can say that Explore's list and shape strip
   * cannot — not "here are 200 heavy wargames" but *where those 200 sit in the whole of
   * board games*. Hiding the other 35,800 would leave a scatter of dots in a void, which is
   * strictly less than the list already told you.
   *
   * The filter language is `Scope` — the same object Explore's rail writes and the same
   * querystring. Not a similar one: the same. So "See on the map" carries your filters here
   * intact, the chips above the canvas read exactly as they do on `/games`, and coming back
   * lands you on the set you left. The map's own rail is encodings only (colour, size,
   * projection); nothing in that column decides which games are in view.
   *
   * A lasso is a filter too. It writes `Scope.lasso` — an explicit id set, the one filter
   * with no semantic form — and shows as one removable chip beside the rest. It can only
   * catch lit points, so a gesture can narrow the set but never silently widen it.
   *
   * Laid out like `/games` — `Container size="wide" fill` > `.workspace` > sidebar +
   * `.canvas` — but the sidebar is a STRIP of two buttons rather than a 16rem column, and
   * what they open floats over the plot. /games can afford a standing rail because its
   * content is a list that reflows around it; here the content is one picture, and a
   * permanent column of ~40 controls beside it is most of what made the page unreadable.
   * On narrow both rails still stack in a bottom sheet, as /games does.
   */
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { initCatalog, catalog, query, appendCollectionFilter } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
    activeFilters,
    toWhere,
    scopeFromParams,
    type Scope
  } from '$lib/catalog/scope';
  import { CATEGORIES, CATEGORY_LABELS } from '$lib/catalog/primary-category';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { DEFAULT_VIEW, fromParams as viewFromParams, type ViewState } from '$lib/map/view';
  import { writeMapUrl, exploreHref } from '$lib/map/route';
  import { scopeMask, type ScopeMask } from '$lib/map/scope-mask';
  import { debounce, SCOPE_DEBOUNCE_MS } from '$lib/catalog/debounce';
  import { ANCHORS } from '$lib/map/anchors';
  import EmbeddingMap from '$lib/map/EmbeddingMap.svelte';
  import MapRail from '$lib/map/MapRail.svelte';
  import Rail from '$lib/catalog/Rail.svelte';
  import FilterChips from '$lib/catalog/FilterChips.svelte';
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import { Container } from '$lib/components/ui/layout';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import type { CanvasApi } from '$lib/map/surface';

  /**
   * `matchMedia` rather than CSS: the rail has to be the SAME component instance whether it
   * is inline or in the sheet — the same reason `/games` does it this way.
   */
  /** The layout's user, for the rail's "My collection only" filter. */
  let { data } = $props();

  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 60rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  let railOpen = $state(false);

  /**
   * Which side panel is open, or `null` for none.
   *
   * The sidebar used to be a 16rem column holding the whole scope rail AND the encodings
   * rail, permanently, which is most of why the page read as busy: ~40 controls on screen
   * to look at a picture. It is a strip of two buttons now, and the panel they open floats
   * OVER the canvas.
   *
   * Over, not beside, for a specific reason: a panel that takes layout width resizes the
   * canvas, and a canvas resize is what put the selection rings off their points in the
   * first place (regl's own ResizeObserver races ours). The selection panel is docked inside
   * the canvas frame for exactly this reason. Nothing here resizes the plot.
   */
  let panel = $state<'filters' | 'controls' | null>(null);
  const togglePanel = (p: 'filters' | 'controls') => (panel = panel === p ? null : p);
  // Leaving narrow with the sheet open would strand a modal over a desktop layout.
  $effect(() => {
    if (!narrow) railOpen = false;
  });

  let mode = $state<'pan' | 'lasso'>('pan');

  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let loadError = $state<string | null>(null);

  /**
   * Seeded synchronously at component creation, like `/games` — arriving from Explore with a
   * warm catalog, the scope->URL mirror below could otherwise run before `afterNavigate`
   * parsed the querystring and write an empty scope back, wiping the filters you arrived
   * with.
   */
  let scope = $state<Scope>(
    browser ? scopeFromParams(new URLSearchParams(location.search)) : { ...DEFAULT_SCOPE }
  );
  let view = $state<ViewState>(
    browser ? viewFromParams(new URLSearchParams(location.search), 6) : { ...DEFAULT_VIEW }
  );
  let hydrated = $state(browser);

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

  // Same shape as /games: read the URL on every navigation that lands here (including a
  // querystring-only change, which SvelteKit doesn't remount for), mirror it back with
  // replaceState — no navigation, no history spam, no feedback loop.
  afterNavigate(() => {
    const params = new URLSearchParams(location.search);
    scope = scopeFromParams(params);
    view = viewFromParams(params, coords?.k ?? 6);
    hydrated = true;
  });
  $effect(() => {
    if (!hydrated) return;
    const qs = writeMapUrl(scope, view);
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });

  const k = $derived(coords?.k ?? 6);
  const components = $derived(Array.from({ length: k }, (_, i) => i + 1));

  // --- the lit set ---------------------------------------------------------------------
  /**
   * Which games the scope keeps, as a flag per point. Every point is still drawn; this only
   * decides which ones keep their colour.
   *
   * Recomputed on every scope change by one DuckDB query — the same query `/games` runs for
   * its list, against the same in-browser catalog, so the two can't disagree about what is
   * in scope. Token-guarded so a slow query can't overwrite a newer one.
   */
  let mask = $state<ScopeMask | null>(null);
  let maskToken = 0;
  /**
   * The scope's compiled WHERE, or `null` while there is nothing to run it against.
   *
   * The null is the readiness signal, and everything that queries is gated on it — including
   * the rail, which must not be rendered until it is a string. `Rail`'s facet lists fetch
   * their counts in an effect keyed on `where`/`column`/`term` and nothing else, so a list
   * mounted before the catalog exists fires one query, fails, and never retries: an empty
   * rail until some unrelated filter change happens to re-trigger it. `/games` avoids this
   * by not drawing its rail until the catalog is ready, and so does this page.
   */
  const where = $derived(
    coords && catalog.status === 'ready' ? appendCollectionFilter(toWhere(scope)) : null
  );
  /**
   * Is the scope narrowing anything *beyond the default*? Only used to decide whether to
   * show chips and frame the camera — never to skip the query.
   *
   * Compares the compiled WHERE rather than counting chips: `activeFilters()` is a chips
   * function and deliberately omits the universe (a dial has no "off"), which once made
   * `u=upcoming` invisible here and lit every game while the list showed a few thousand.
   */
  const baseWhere = $derived(appendCollectionFilter(toWhere({ ...DEFAULT_SCOPE })));
  const filtered = $derived(where != null && where !== baseWhere);
  /**
   * Ask the database for the lit set — debounced, and never skipped.
   *
   * **Never skipped.** There used to be a "no filters, so light everything" shortcut here,
   * and it was wrong for a reason worth keeping written down: the artifact's population is
   * not the default scope's. Coordinates are built over `users_rated >= 30 OR year_published
   * >= <this year>`, while the default scope is `users_rated >= 30` alone — so the artifact
   * carries ~5,250 upcoming games with too few ratings that the default deliberately
   * excludes. Lighting "everything in the artifact" drew all 36,001 at full strength when
   * the honest answer was 30,748. The compiled WHERE is the only authority on what a scope
   * means, so every scope goes through it.
   *
   * **Debounced**, because this is the site's one genuinely expensive per-scope query. The
   * list's equivalent is a `COUNT(*)` — one row, affordable on every keystroke. This one
   * reads a ~30k-row id column and walks it into a per-point mask. With the scope rail on
   * this page `scope.q` changes once per character, and undebounced that is a full-catalog
   * query per letter, each landing on a canvas mid-transition.
   *
   * Token-guarded as well as debounced: debouncing bounds how many queries start, the token
   * decides which result is allowed to win.
   */
  const runMask = debounce((c: CoordinateSet, w: string, mine: number) => {
    scopeMask(c, w)
      .then((m) => mine === maskToken && (mask = m))
      .catch((e) => console.error('scope mask failed', e));
  }, SCOPE_DEBOUNCE_MS);
  $effect(() => {
    const c = coords;
    const w = where;
    if (!c || w == null) return;
    const mine = ++maskToken;
    runMask(c, w, mine);
    return () => runMask.cancel();
  });

  /** Same count /games puts on its Filters trigger, from the same function. */
  const activeCount = $derived(
    activeFilters(scope).length + (catalog.collectionUsername ? 1 : 0)
  );

  const lit = $derived(mask?.lit ?? null);
  const inScope = $derived(mask?.inScope ?? 0);
  /**
   * The denominator: how many games the artifact places, and the honest "of N" the lit count
   * is read against. Not the same as the number of games in any given scope.
   */
  const placed = $derived(coords?.ids.length ?? 0);

  /**
   * Zoom to the set you just asked for.
   *
   * Filtering changes what you are looking at, so the camera goes and looks at it: lasso a
   * corner and it fills the frame, clear the filter and you are back to the whole landscape.
   * Without this, narrowing to forty games leaves them as forty specks somewhere in a
   * full-map view and you have to find your own answer by hand.
   *
   * `focus`, not `keep`: `keep` REMOVES the other points, which is what this page stopped
   * doing when dimming replaced hiding. The context stays drawn — framing is a camera move,
   * not a filter. (It was `keep` while the lasso hid everything else.)
   *
   * Capped: framing thousands of points costs a full positional redraw and buys nothing,
   * since a set that large is spread over most of the map anyway.
   */
  const FRAME_MAX = 600;
  const frame = $derived.by(() => {
    if (!coords || !mask || !filtered) return null;
    if (inScope === 0 || inScope > FRAME_MAX) return null;
    const ids: number[] = [];
    for (let i = 0; i < mask.lit.length; i++) if (mask.lit[i]) ids.push(coords.ids[i]);
    return ids;
  });


  // --- selection -----------------------------------------------------------------------
  /** A searched-for game the catalog knows but the artifact lacks — "not yet placed". */
  let unplaced = $state<{ id: number; name: string } | null>(null);
  /** Games picked out by clicking. Highlight, not filter — the lasso is the filter. */
  let selected = $state<number[]>([]);
  let panelOpen = $state(true);

  /**
   * A click toggles a game into the highlighted set; a lasso writes `Scope.lasso`.
   *
   * These used to be one list with a `keepOnly` flag deciding, per gesture, whether it had
   * been a filter or a highlight — which is why the interaction felt arbitrary. Now the
   * gesture picks the target: pointing at a game highlights it, drawing around a region
   * filters to it. The map layer only proposes; this decides.
   */
  function onSelectionChange(ids: number[]) {
    if (mode === 'lasso' && ids.length !== 1) {
      scope = { ...scope, lasso: ids };
      selected = [];
      return;
    }
    selected = ids;
    if (ids.length) panelOpen = true;
  }
  function removeFromSelection(id: number) {
    selected = selected.filter((x) => x !== id);
  }

  // --- legend filter -------------------------------------------------------------------
  /**
   * The legend's palette codes and `Scope.categories`' tag names are the same column read
   * two ways, so a swatch click can write the real filter rather than a map-only one.
   *
   * Clicking "Wargame" selects every game TAGGED Wargame, which is a slightly larger set
   * than the points PAINTED Wargame — an 18xx game carries both and is painted Trains. That
   * is the honest reading of the filter, and one filter language is worth more than a
   * swatch that selects exactly its own pixels.
   */
  const activeCategories = $derived.by(() => {
    if (!scope.categories.length) return null;
    const codes = scope.categories
      .map((name) => CATEGORIES.indexOf(name) + 1)
      .filter((c) => c > 0);
    return codes.length ? codes : null;
  });
  function toggleCategory(code: number) {
    const name = CATEGORY_LABELS[code];
    if (!name || code === 0) return; // "Other" is a fallthrough, not a filter
    const cur = scope.categories;
    scope = {
      ...scope,
      categories: cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name]
    };
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
    const rows = selected
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
      if (!selected.includes(hit.game_id)) { selected = [...selected, hit.game_id]; panelOpen = true; }
    } else unplaced = { id: hit.game_id, name: hit.name };
  }

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
  <title>The map — board game landscape</title>
</svelte:head>

{#snippet timelineControls()}
  <div class="timeline">
    <div class="tl-row">
      <button type="button" class="chip" onclick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
      <span class="year">{shownYear ?? 'all years'}</span>
      {#if upTo != null}<button type="button" class="chip clear" onclick={stopTimeline} aria-label="Clear year filter">×</button>{/if}
    </div>
    <input
      type="range"
      min={TIMELINE_START}
      max={TIMELINE_END}
      value={shownYear ?? TIMELINE_END}
      oninput={(e) => { pause(); upTo = +e.currentTarget.value; }}
      aria-label="Published up to"
    />
    <label class="tick">
      <input type="number" min="20" max="5000" step="10" bind:value={tickMs} aria-label="Tick speed, milliseconds per year" />
      <span>ms per year</span>
    </label>
  </div>
{/snippet}

<Container size="wide" fill>
  <div class="workspace" class:narrow>
    {#if !narrow}
      <!-- The sidebar collapsed to two buttons, with whichever panel they open sliding in
           beside them. The panel is part of the COLUMN, not an overlay on the plot: floating
           it kept the map a constant width but read as something landing on top of the map
           rather than as the sidebar opening, which is what it is. -->
      <div class="side">
      <aside class="strip">
        <button
          type="button"
          class="tab"
          class:on={panel === 'filters'}
          aria-expanded={panel === 'filters'}
          onclick={() => togglePanel('filters')}
        >
          <!-- PLACEHOLDER COPY (Phil): button labels. -->
          <span>Filters</span>
          {#if activeCount}<span class="badge">{activeCount}</span>{/if}
        </button>
        <button
          type="button"
          class="tab"
          class:on={panel === 'controls'}
          aria-expanded={panel === 'controls'}
          onclick={() => togglePanel('controls')}
        >
          <span>Controls</span>
        </button>
      </aside>
        {#if panel !== null}
        <!-- One scrolling column docked to the map's left edge. `Rail` is the same
             component /games uses, so the filters here and the filters there cannot
             drift; `MapRail` carries the encodings and the timeline. -->
        <div class="panel">
          <header>
            <!-- PLACEHOLDER COPY (Phil): panel headings. -->
            <h2>{panel === 'filters' ? 'Filters' : 'Controls'}</h2>
            <button type="button" class="close" onclick={() => (panel = null)} aria-label="Close">×</button>
          </header>
          <div class="panel-body">
            {#if panel === 'filters'}
              {#if where != null}
                <Rail bind:scope {where} bggUsername={data.user?.bgg_username ?? null} />
              {/if}
            {:else}
              <MapRail bind:view {components} timeline={timelineControls} />
            {/if}
          </div>
        </div>
      {/if}
      </div>
    {/if}

    <div class="canvas">
      {#if filtered}
        <div class="chiprow">
          <FilterChips bind:scope onclear={() => (scope = { ...DEFAULT_SCOPE, universe: scope.universe })} />
        </div>
      {/if}

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
        <!-- On the canvas, not above it: these act on what you are looking at, so they sit
             where you are looking. Top-left is the corner the plot leaves emptiest, and the
             selection panel docks top-right. -->
        <!-- No export trigger on the canvas for now: where it belongs is unsettled, and a
             button parked in a corner to be decided later is exactly the clutter this pass
             is removing. The panel and `exportPng` are untouched below, so restoring it is
             one button. -->

        <!-- Top-left: what you are looking at, and how to find one thing in it. -->
        <div class="stack left">
          <div class="hud readout">
            <p class="count">
              {#if coords && facts && mask}
                <!-- Both branches read the LIT count, including at the default scope. The
                     unfiltered branch used to print the artifact's row count instead, on the
                     assumption that no filters means every game — but the artifact also
                     carries ~5,250 thinly-rated upcoming games the default scope excludes,
                     so it claimed 36,001 when the answer was 30,748. -->
                <b class="tnum">{inScope.toLocaleString()}</b>
                <span>{inScope === 1 ? 'game' : 'games'}</span>
                {#if inScope !== placed}
                  <span class="dim">of <span class="tnum">{placed.toLocaleString()}</span></span>
                {/if}
                {#if mask && mask.unplaced > 0}
                  <!-- Only when it would actually mislead. ~245 games site-wide carry no
                       coordinates — folk games and bookkeeping entries with too little
                       text to embed — so this stays silent until someone has filtered down
                       to where they matter. -->
                  <span class="dim" title="Games with no coordinates in the current embedding — mostly traditional games with no publisher or year.">
                    · <span class="tnum">{mask.unplaced.toLocaleString()}</span> not placed
                  </span>
                {/if}
              {/if}
            </p>
            <!-- The way back. The same scope, rendered as a list — so the map is a view of
                 your set rather than a place you end up. -->
            <a class="cross" href={exploreHref(scope)}>
              {filtered ? 'See these as a list' : 'Browse as a list'} <span aria-hidden="true">→</span>
            </a>
          </div>

          <!-- No `.hud` wrapper: the input already carries its own border, background and
               radius, so wrapping it drew a second border 0.3rem outside the first. It is a
               stack member in its own right. -->
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
        </div>



        {#if loadError}
        <div class="state error">Couldn’t load the map: {loadError}</div>
      {:else if !coords || !facts}
        <div class="state">Loading {catalog.status === 'ready' ? 'coordinates' : 'catalog'}…</div>
      {:else}
        <EmbeddingMap
          {coords}
          {facts}
          {view}
          {lit}
          {selected}
          {activeCategories}
          focus={frame}
          anchors={ANCHORS}
          {upTo}
          {mode}
          bind:api
          onselectionchange={onSelectionChange}
          ontogglecategory={toggleCategory}
        />
      {/if}
      <!-- Top-right: the tools that act on the view, and beneath them the panel for what
           you picked. ONE column, so the panel can never land under the tools - both used
           to dock to this corner independently and overlapped the moment a selection
           existed. -->
      <div class="stack right">
        <div class="hud tools">
          <div class="mode">
            <SegGroup
              ariaLabel="Drag mode"
              options={[
                { value: 'pan' as const, label: 'Pan' },
                { value: 'lasso' as const, label: 'Lasso' }
              ]}
              value={mode}
              onchange={(v) => (mode = v)}
            />
          </div>
          {#if narrow}
            <!-- The ONLY way into filters and encodings on narrow: the sidebar is not
                 rendered at that width, so losing this strands the page.
                 PLACEHOLDER COPY (Phil). -->
            <Button size="sm" variant="outline" class="relative" onclick={() => (railOpen = true)}>
              Filters &amp; display
              {#if activeCount}
                <span
                  class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                  >{activeCount}</span
                >
              {/if}
            </Button>
          {/if}
        </div>
      {#if rows.length}
        <section class="lasso" class:shut={!panelOpen}>
          <header>
            <button
              type="button"
              class="panel-toggle"
              aria-expanded={panelOpen}
              onclick={() => (panelOpen = !panelOpen)}
              title={panelOpen ? 'Collapse the list — keeps the selection' : 'Show the list'}
            >
              <span class="caret" aria-hidden="true">{panelOpen ? '▾' : '▸'}</span>
              <strong>{rows.length.toLocaleString()} {rows.length === 1 ? 'game' : 'games'} picked</strong>
            </button>
            <span class="actions">
              <!-- No "show these only" any more: a lasso already IS the filter, and it shows
                   as a chip above the canvas. This panel is what you pointed at, which is a
                   highlight — so the only action it needs is to stop highlighting. -->
              <button type="button" class="chip" onclick={() => (selected = [])}>Clear ×</button>
            </span>
          </header>
          <div class="table-wrap" hidden={!panelOpen}>
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
          {coords.model} v{coords.version} · dev only
        </p>
      {/if}
    </div>
  </div>
</Container>

<!-- Narrow: the rail becomes a bottom sheet you deliberately enter, the same call /games
     made and for the same reason. Left short of full height so a sliver of the map stays
     visible behind it. -->
<Sheet.Root bind:open={railOpen}>
  <Sheet.Content side="bottom" class="flex h-[92dvh] max-h-[92dvh] flex-col p-0">
    <Sheet.Header class="border-b border-border">
      <!-- PLACEHOLDER COPY (Phil) — see the trigger above. -->
      <Sheet.Title>Filters &amp; display</Sheet.Title>
    </Sheet.Header>
    <div class="sheet-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {#if where != null}
          <Rail bind:scope {where} bggUsername={data.user?.bgg_username ?? null} />
        {/if}
        <MapRail seam={where != null} bind:view {components} timeline={timelineControls} />
    </div>
    <Sheet.Footer class="border-t border-border">
      <Button size="lg" class="w-full" onclick={() => (railOpen = false)}>
        Show the map
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<style>
  /* Width and fill-height belong to <Container size="wide" fill> — see layout/tokens.ts.
     Same grid as /games: a fixed rail and a canvas that takes what is left. */
  /* A strip of buttons, not a column of controls. Its panel floats over the plot, so the
     canvas width is the same open or shut. */
  .workspace {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-md);
    height: 100%;
    min-height: 0;
  }
  .workspace.narrow { grid-template-columns: 1fr; }

  .strip { display: flex; flex-direction: column; gap: 0.4rem; min-height: 0; }
  .tab {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    width: 100%; padding: 0.45rem 0.7rem;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); color: var(--muted-foreground);
    font: inherit; font-size: 0.8rem; text-align: left; cursor: pointer;
  }
  .tab:hover { color: var(--foreground); }
  .tab.on { color: var(--foreground); border-color: var(--primary); background: var(--muted); }
  .tab:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 1rem; height: 1rem; padding: 0 0.25rem; border-radius: 999px;
    background: var(--primary); color: var(--primary-foreground);
    font-size: 0.65rem; font-weight: 700;
  }

  /* Strip and panel share one grid cell, so the cell's `auto` width grows when the panel
     opens and the canvas gives up the space. */
  .side { display: flex; gap: var(--space-sm); min-height: 0; }

  /*
   * The panel is part of the sidebar, not an overlay on the plot.
   *
   * It floated over the canvas first, which kept the map a constant width — worth having,
   * because a canvas resize is what put the selection rings off their points originally
   * (regl's ResizeObserver races ours). But it read as something landing ON the map rather
   * than as the sidebar opening. The resize is survivable and the confusion was not: that
   * bug was a panel mounting *underneath* the map mid-interaction, where nobody asked for a
   * size change. This one is a deliberate toggle, and the overlay redraws on regl's own
   * `draw` event after it settles.
   *
   * Not animated, deliberately. A width transition resizes the canvas every frame it runs,
   * and each resize is a full repaint of 36k points.
   */
  .panel {
    width: 17rem;
    display: flex; flex-direction: column; min-height: 0;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card);
  }
  .panel header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.5rem var(--space-md);
    border-bottom: 1px solid var(--border);
  }
  .panel h2 {
    margin: 0; font-size: 0.72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground);
  }
  .panel .close {
    border: 0; background: none; padding: 0 0.25rem; cursor: pointer;
    color: var(--muted-foreground); font-size: 1rem; line-height: 1;
  }
  .panel .close:hover { color: var(--foreground); }
  .panel-body { overflow-y: auto; min-height: 0; padding: 0 var(--space-md) var(--space-md); }

  .canvas {
    display: flex; flex-direction: column; gap: var(--space-sm);
    min-width: 0; min-height: 0;
  }

  .count { margin: 0; display: inline-flex; align-items: baseline; gap: 0.35rem; }
  .count b { font-size: 1.1rem; color: var(--foreground); font-weight: 700; }
  .count .dim { color: var(--muted-foreground); }
  .tnum { font-variant-numeric: tabular-nums; }

  /*
   * Everything that floats over the plot shares one chrome.
   *
   * There were two of these written out (the tools cluster, then the selection panel) before
   * the count and the search joined them, and a third copy of the same four declarations is
   * how a page starts drifting from itself. Corners are set per element; the surface is set
   * once here.
   */
  .hud {
    position: absolute; z-index: 2;
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.3rem; border-radius: var(--radius);
    background: color-mix(in oklch, var(--card) 88%, transparent);
    border: 1px solid var(--border);
    backdrop-filter: blur(6px);
  }

  /*
   * Two columns over the plot: what you are looking at on the left, what acts on it on the
   * right. Members stack rather than each docking to the corner independently, which is what
   * let the tools and the selection panel occupy the same spot.
   *
   * `align-items` keeps each child its own width instead of stretching to the widest, so the
   * count does not inherit the search box's width.
   */
  .stack {
    position: absolute; top: var(--space-sm); z-index: 2;
    display: flex; flex-direction: column; gap: var(--space-sm);
    max-height: calc(100% - 2 * var(--space-sm));
    pointer-events: none;
  }
  .stack > :global(*) { pointer-events: auto; }
  .stack.left { left: var(--space-sm); align-items: flex-start; }
  .stack.right { right: var(--space-sm); align-items: flex-end; min-height: 0; }

  /* Inside a stack the chrome is positioned by the stack, not by itself. */
  .stack .hud { position: static; }

  .readout {
    gap: var(--space-md); font-size: 0.85rem; color: var(--muted-foreground);
    padding: 0.3rem 0.6rem;
  }

  .mode { width: 9rem; }


  /* Provenance under the map, quiet; the full detail is in its title attribute. */
  .prov { margin: 0; color: var(--muted-foreground); font-size: 0.75rem; }

  .search { position: relative; min-width: min(16rem, 100%); }
  .search input {
    width: 100%;
    backdrop-filter: blur(6px);
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.35rem 0.6rem;
    font: inherit;
    font-size: 0.85rem;
  }
  .search input:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
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
  /* Stacked for the rail's 16rem: controls and the year on one row, the scrubber full
     width beneath, tick speed last. */
  .timeline { display: flex; flex-direction: column; gap: 0.35rem; }
  .tl-row { display: flex; align-items: center; gap: 0.4rem; }
  .timeline input[type='range'] { width: 100%; min-width: 0; }
  .timeline .year {
    font-variant-numeric: tabular-nums; color: var(--foreground); font-size: 0.85rem;
  }
  .timeline .clear { margin-left: auto; }
  .timeline .tick {
    display: flex; align-items: center; gap: 0.35rem;
    color: var(--muted-foreground); font-size: 0.7rem;
  }
  .timeline .tick input { width: 4rem; }
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
    /* Positioned by `.stack.right`, not by itself — see that rule. */
    width: max-content; max-width: min(36rem, 48%);
    min-height: 0;
    display: flex; flex-direction: column; gap: var(--space-sm);
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.3);
    padding: var(--space-sm) var(--space-md);
  }
  .lasso header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
  /* Shut: the header alone, so the set stays visible on the map with its count and controls
     still to hand. */
  .lasso.shut { max-height: none; }
  /* NOT `.collapse`: that is a Tailwind utility (`visibility: collapse`), and the global
     utility layer beats a component's scoped rule — the button rendered at full width with
     its text intact and simply could not be seen. Rail.svelte carries the same warning about
     `.fixed` / `.grow`. */
  .panel-toggle {
    display: inline-flex; align-items: center; gap: 0.5rem;
    border: 1px solid transparent; border-radius: var(--radius);
    background: none; cursor: pointer;
    padding: 0.2rem 0.5rem; margin-left: -0.5rem;
    font: inherit; color: var(--foreground);
  }
  .panel-toggle:hover { background: var(--muted); border-color: var(--border); }
  /* Same weight as the count it sits beside — a 0.75rem muted glyph was technically present
     and practically invisible, which is how the control went unfound. */
  .panel-toggle .caret {
    color: var(--foreground); font-size: 0.8rem; line-height: 1;
    transition: transform 0.12s ease;
  }
  @media (prefers-reduced-motion: reduce) { .panel-toggle .caret { transition: none; } }
  .panel-toggle:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
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
  .lasso tbody tr:hover { background: var(--muted); }
  .remove { border: 0; background: none; color: var(--muted-foreground); cursor: pointer; font-size: 1rem; line-height: 1; }
  .remove:hover { color: var(--foreground); }
  .lasso a { color: var(--primary); text-decoration: none; }
  .lasso a:hover { text-decoration: underline; }


</style>
