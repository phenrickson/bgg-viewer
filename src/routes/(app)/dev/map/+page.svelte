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
   * Laid out like `/games`: `Container size="wide" fill` > `.workspace` > `.sidebar` +
   * `.canvas`, with the rail moving into a bottom sheet on narrow.
   */
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { initCatalog, catalog, query, appendCollectionFilter } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
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
  import { scopeMask, allLit, type ScopeMask } from '$lib/map/scope-mask';
  import { ANCHORS } from '$lib/map/anchors';
  import EmbeddingMap from '$lib/map/EmbeddingMap.svelte';
  import MapRail from '$lib/map/MapRail.svelte';
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
  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 60rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  let railOpen = $state(false);
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
  const where = $derived(
    coords && catalog.status === 'ready' ? appendCollectionFilter(toWhere(scope)) : null
  );
  /**
   * Is the scope narrowing anything?
   *
   * Compares the compiled WHERE against the default's, rather than counting chips.
   * `activeFilters()` is a *chips* function and deliberately omits the universe — it is a
   * dial with no "off", so it gets no removable chip — which made "upcoming" invisible here:
   * the page took the all-lit path and drew all 36,001 games at full strength while the list
   * showed a few thousand. Comparing the SQL catches the universe, `rankedOnly` and every
   * ordinary filter by construction, so this cannot drift from `toWhere` again.
   *
   * All-rated is the default, so arriving at the map cold still lights the whole landscape.
   */
  const baseWhere = $derived(appendCollectionFilter(toWhere({ ...DEFAULT_SCOPE })));
  const filtered = $derived(where != null && where !== baseWhere);
  $effect(() => {
    const c = coords;
    const w = where;
    if (!c || w == null) return;
    // No filters: everything is lit, and there is nothing to ask the database.
    if (!filtered) {
      mask = allLit(c);
      return;
    }
    const mine = ++maskToken;
    scopeMask(c, w)
      .then((m) => mine === maskToken && (mask = m))
      .catch((e) => console.error('scope mask failed', e));
  });

  const lit = $derived(mask?.lit ?? null);
  const inScope = $derived(mask?.inScope ?? coords?.ids.length ?? 0);
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
      <aside class="sidebar">
        <MapRail bind:view {components} timeline={timelineControls} />
      </aside>
    {/if}

    <div class="canvas">
      <!-- Above the map: the count and the one control that is a question about the data
           (search). Everything else that acts on the view lives ON the canvas or under it —
           a bar of tools above the graph was the old control strip in miniature, and it
           wrapped the same way. Explore puts only its count here too. -->
      <div class="chead">
        <p class="count">
          {#if coords && facts}
            {#if filtered}
              <!-- The count says the same thing the plot does: a lit set, read against a
                   whole. "of 36,001" is not decoration — it is the denominator that makes
                   the dimmed points mean something. -->
              <b class="tnum">{inScope.toLocaleString()}</b>
              <span>{inScope === 1 ? 'game' : 'games'}</span>
              <span class="dim">of <span class="tnum">{placed.toLocaleString()}</span></span>
            {:else}
              <b class="tnum">{placed.toLocaleString()}</b>
              <span>games</span>
            {/if}
            {#if mask && mask.unplaced > 0}
              <!-- Only when it would actually mislead. ~245 games site-wide carry no
                   coordinates — folk games and bookkeeping entries with too little text to
                   embed ("Go Fish", "Unpublished Prototype") — so this is silent until
                   someone has filtered down to where they matter. -->
              <span class="dim" title="Games with no coordinates in the current embedding — mostly traditional games with no publisher or year.">
                · <span class="tnum">{mask.unplaced.toLocaleString()}</span> not placed
              </span>
            {/if}
          {/if}
        </p>

        <div class="head-right">
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
          <!-- The way back. The same scope, rendered as a list — so the map is a view of
               your set rather than a place you end up. -->
          <a class="cross" href={exploreHref(scope)}>
            {filtered ? 'See these as a list' : 'Browse as a list'} <span aria-hidden="true">→</span>
          </a>
          {#if narrow}
            <Button size="sm" variant="outline" onclick={() => (railOpen = true)}>Display</Button>
          {/if}
        </div>
      </div>

      <!-- Exactly the chips /games shows, from exactly the same `Scope`. A lasso appears
           here as "on the map · 412 selected", removable like any other filter — which is
           what makes a gesture over the canvas part of the same language as the rail. -->
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
        <div class="tools">
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
          <button type="button" class="chip" class:on={exportOpen} onclick={() => (exportOpen = !exportOpen)}>Export</button>
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
      <Sheet.Title>Display</Sheet.Title>
    </Sheet.Header>
    <div class="sheet-scroll min-h-0 flex-1 overflow-y-auto p-4">
      <MapRail bind:view {components} timeline={timelineControls} />
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
  .head-right { display: inline-flex; align-items: center; gap: var(--space-md); }

  /* Floating over the plot's emptiest corner. The selection panel docks top-right, so these
     take top-left; both sit above the overlay canvas. */
  .tools {
    position: absolute; top: var(--space-sm); left: var(--space-sm); z-index: 2;
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.3rem; border-radius: var(--radius);
    background: color-mix(in oklch, var(--card) 88%, transparent);
    border: 1px solid var(--border);
  }
  .mode { width: 9rem; }


  /* Provenance under the map, quiet; the full detail is in its title attribute. */
  .prov { margin: 0; color: var(--muted-foreground); font-size: 0.75rem; }

  .search { position: relative; min-width: min(16rem, 100%); }
  .search input {
    width: 100%;
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
