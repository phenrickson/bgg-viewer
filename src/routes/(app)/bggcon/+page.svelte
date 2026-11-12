<script lang="ts">
  /**
   * BGG.CON 2026 library dashboard (temporary; spec docs/superpowers/specs/2026-11-12-bggcon-library-design.md §4).
   *
   * Explore's shell (`Container` + sidebar `Rail` + canvas, `RailSheet` on a phone), with the
   * library loaded into DuckDB beside the catalog: counts up top, a focus list of starred
   * games, the whole library paged, and the library games the catalog doesn't have.
   * Availability refreshes every minute while the tab is visible.
   */
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere, type Scope } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import FilterChips from '$lib/catalog/FilterChips.svelte';
  import RailSheet from '$lib/catalog/rail/RailSheet.svelte';
  import { Container } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import { SegmentedControl } from '$lib/components/ui/segmented-control';
  import { ensureConLibrary, refreshAvailability } from '$lib/bggcon/client';
  import { stars } from '$lib/bggcon/stars.svelte';
  import {
    countsSql, countSql, tableWhere, LIBRARY_FROM, LIBRARY_NAME, LIBRARY_SELECT, AVAILABLE_SORT,
    type Mode, type ListArgs, type LibraryListRow
  } from '$lib/bggcon/queries';
  import GameList, { type ExtraColumn, type GameListRow } from '$lib/catalog/views/GameList.svelte';
  import ShelfStatus from './ShelfStatus.svelte';
  import StarButton from './StarButton.svelte';
  import GamePanel from './GamePanel.svelte';
  import { fetchVectors } from '$lib/recommend/vectors';

  const REFRESH_MS = 60_000;
  const ready = $derived(catalog.status === 'ready');
  const narrowQuery = new MediaQuery('max-width: 40rem');
  const narrow = $derived(narrowQuery.current);
  let filtersOpen = $state(false);

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let mode = $state<Mode>('all');
  /** Any game, games with a copy available, or games with a copy checked out ("in use"). */
  let availability = $state<'any' | 'available' | 'out'>('any');
  let libraryIds = $state.raw<ReadonlySet<number>>(new Set());
  let loadError = $state<string | null>(null);
  let asOf = $state<string | null>(null);
  let stale = $state(false);
  let counts = $state<{ games: number; on_shelf: number; copies_out: number; not_in_catalog: number } | null>(null);
  let focusOnShelf = $state(0);

  onMount(() => {
    initCatalog();
    // The home page starts this too; here for a visit straight to this page.
    fetchVectors().catch((e) => console.error('vectors failed', e));
    stars.load().catch((e) => console.error('stars failed', e));
  });

  async function refresh() {
    try {
      const s = await refreshAvailability();
      asOf = s.asOf;
      stale = s.stale;
    } catch (e) {
      console.error('availability refresh failed', e);
      stale = true;
    }
  }

  // Once the catalog is in: load the library beside it, then availability.
  $effect(() => {
    if (!ready) return;
    ensureConLibrary()
      .then(async () => {
        const ids = await query<{ game_id: number }>('SELECT game_id FROM con_library');
        libraryIds = new Set(ids.map((r) => Number(r.game_id)));
        await refresh();
      })
      .catch((e) => (loadError = e instanceof Error ? e.message : String(e)));
  });

  // Every minute, but only while someone can see the page; and once on coming back to it.
  $effect(() => {
    if (!catalog.libraryLoaded) return;
    const tick = () => document.visibilityState === 'visible' && refresh();
    const timer = setInterval(tick, REFRESH_MS);
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  });

  $effect(() => {
    if (!catalog.libraryLoaded) return;
    catalog.checkedOutVersion;
    query<NonNullable<typeof counts>>(countsSql())
      .then((r) => (counts = r[0] ?? null))
      .catch((e) => console.error('counts failed', e));
  });

  $effect(() => {
    if (!catalog.libraryLoaded) return;
    catalog.checkedOutVersion;
    const ids = [...stars.ids];
    query<{ n: number }>(countSql({ mode: 'focus', ids, availableOnly: true }))
      .then((r) => (focusOnShelf = r[0]?.n ?? 0))
      .catch((e) => console.error('focus count failed', e));
  });

  /** The Rail's facet counts are scoped to the library, not the whole catalog. */
  // The library decides membership and spans rated and brand-new games, so no universe clause.
  const scopeWhere = $derived(toWhere(scope, { anyUniverse: true }));
  const railWhere = $derived(`${scopeWhere} AND game_id IN (SELECT game_id FROM con_library)`);

  // A name search looks across the whole library, from any view, so a game can be found and starred.
  const searching = $derived(scope.q.trim() !== '');
  const shelf = $derived({ availableOnly: availability === 'available', inUseOnly: availability === 'out' });
  const args = $derived<ListArgs>(
    mode === 'missing'
      ? { mode: 'missing', q: scope.q, ...shelf }
      : mode === 'focus' && !searching
        ? { mode: 'focus', ids: [...stars.ids], ...shelf }
        : { mode: 'all', where: scopeWhere, ...shelf }
  );

  // The counts double as filters: each sets the same view or availability the controls below
  // and the rail's switch set, and a second click turns it back off.
  const toggleAvailability = (v: 'available' | 'out') => (availability = availability === v ? 'any' : v);
  const toggleMode = (v: Mode) => (mode = mode === v ? 'all' : v);
  const showEverything = () => {
    mode = 'all';
    availability = 'any';
  };

  // PLACEHOLDER copy (Phil): the view names and empty states.
  const MODE_OPTIONS: { value: Mode; label: string }[] = [
    { value: 'all', label: 'Whole library' },
    { value: 'focus', label: 'Focus list' },
    { value: 'missing', label: 'Not in catalog' }
  ];
  // Explore's table over the library, for every view: geek rating, complexity and availability,
  // a star on each row, and a game opening in place under its row. Games the catalog lacks
  // show "—" for rating and complexity.
  let openId = $state<number | null>(null);
  // Opens at once; the panel keeps room for its similar games while they're looked up.
  const toggleOpen = (id: number) => (openId = openId === id ? null : id);
  // Starred first, then by geek rating; re-sorts as games are starred.
  const STAR_SORT = $derived({
    label: '★',
    hint: 'Sort by your focus list',
    sql: stars.ids.length ? `(game_id IN (${[...stars.ids].map(Math.trunc).join(', ')}))` : 'FALSE',
    then: 'NULLIF(c.geek_rating, 0) DESC NULLS LAST'
  });
  const AVAILABILITY: ExtraColumn[] = [
    { key: 'avail', label: 'Availability', sql: AVAILABLE_SORT, then: 'NULLIF(c.geek_rating, 0) DESC NULLS LAST', hint: 'copies available now', width: '8.5rem', cell: availCell }
  ];

  const asOfText = $derived(
    asOf ? new Date(asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
  );
</script>

{#snippet availCell(r: GameListRow)}
  <ShelfStatus available={Number(r.available)} copies={Number(r.copies)} />
{/snippet}
{#snippet star(r: GameListRow)}<StarButton id={r.game_id} name={r.name} />{/snippet}
{#snippet panel(r: GameListRow)}
  <GamePanel game={r as unknown as LibraryListRow} {libraryIds} {asOf} />
{/snippet}

<svelte:head><title>BGG.CON Library · Boardgame-Viz</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn’t load the catalog: {catalog.error}</p>
{:else if loadError}
  <p class="state err">Couldn’t load the BGG.CON library: {loadError}</p>
{:else if !ready || !catalog.libraryLoaded}
  <div class="state">
    <span class="spin"></span>
    <p>Loading the catalog and the BGG.CON library…</p>
  </div>
{:else}
  <Container size="wide" fill>
    {#if narrow}
      <div class="flex items-center gap-2 pb-3">
        <Button variant="outline" size="sm" class="w-full" aria-haspopup="dialog" aria-expanded={filtersOpen} onclick={() => (filtersOpen = true)}>
          Filters
        </Button>
        <RailSheet bind:open={filtersOpen} {narrow} title="Filters" done="Show games">
          <Rail bind:scope where={railWhere} showUniverse={false} showSearch={false} groupAdvanced bind:availableNow={() => availability === 'available', (v) => (availability = v ? 'available' : 'any')} />
        </RailSheet>
      </div>
    {/if}

    <div class="workspace" class:narrow>
      {#if !narrow}
        <div class="sidebar">
          <Rail bind:scope where={railWhere} showUniverse={false} showSearch={false} groupAdvanced bind:availableNow={() => availability === 'available', (v) => (availability = v ? 'available' : 'any')} />
        </div>
      {/if}

      <div class="canvas">
        <div class="chead">
          {#if counts}
            <button class="count" aria-pressed={mode === 'all' && availability === 'any'} onclick={showEverything}><b class="tnum">{counts.games.toLocaleString()}</b> games <span class="dim">in the library</span></button>
            <button class="count" aria-pressed={availability === 'available'} onclick={() => toggleAvailability('available')}><b class="tnum">{counts.on_shelf.toLocaleString()}</b> available</button>
            <button class="count" aria-pressed={availability === 'out'} onclick={() => toggleAvailability('out')}><b class="tnum">{counts.copies_out.toLocaleString()}</b> copies out</button>
            <button class="count focus" aria-pressed={mode === 'focus'} onclick={() => toggleMode('focus')}><b class="tnum">{stars.count}</b> in your focus list <span class="dim">· {focusOnShelf} available</span></button>
          {/if}
        </div>
        {#if asOfText}
          <p class="asof">As of {asOfText}{#if stale} · couldn’t refresh{/if} · refreshes every minute</p>
        {/if}
        {#if stars.error}<p class="state err">{stars.error}</p>{/if}

        <div class="ctl">
          <!-- Above the list rather than in the rail, where it was easy to miss. Searches the whole
               library from any view (see `searching`). Styled as the rail's search was. -->
          <label class="find">
            <span class="sr-only">Search game names in the library</span>
            <input type="search" placeholder="Search the library…" bind:value={scope.q} />
          </label>
          <SegmentedControl label="Show" size="md" options={MODE_OPTIONS} value={mode} onchange={(v) => (mode = v)} />
          <FilterChips bind:scope onclear={() => (scope = { ...DEFAULT_SCOPE })} />
        </div>

        <GameList
            where={tableWhere(args)}
            cards={narrow}
            source={LIBRARY_FROM}
            nameSql={LIBRARY_NAME}
            select={LIBRARY_SELECT}
            columns={['name', 'geek', 'weight']}
            extra={AVAILABILITY}
            lead={star}
            onopen={toggleOpen}
            zeroIsMissing
            leadSort={STAR_SORT}
            {openId}
            detail={panel}
          />
      </div>
    </div>
  </Container>
{/if}

<style>
  /* Shell, state and header rules follow Explore's (`(app)/games/+page.svelte`). */
  .state {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--muted-foreground);
    margin: 0;
  }
  .state p { margin: 0; }
  .state.err { color: var(--color-negative); }
  .spin {
    width: 0.9rem;
    height: 0.9rem;
    flex: none;
    border-radius: 50%;
    border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    border-top-color: var(--primary);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

  .workspace {
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    gap: var(--space-lg);
    height: 100%;
    min-height: 0;
  }
  .workspace.narrow { grid-template-columns: minmax(0, 1fr); }
  .sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sidebar :global(.rail) { flex: 1 1 auto; }
  .canvas {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 0;
    min-height: 0;
    container-type: inline-size;
    /* The scroll area must be the containing block for absolutely positioned descendants (the
       rows' screen-reader labels). Without it they're placed against the page, deep down the
       list, and stretch the whole page into empty space below the footer. */
    position: relative;
  }
  /* Header, controls and list share one capped column, so nothing floats to the far edge. */
  .canvas > :global(*) {
    max-width: 64rem;
  }
  .chead {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm) var(--space-lg);
    flex-wrap: wrap;
  }
  .count {
    margin: 0;
    padding: 0 0 0.15rem;
    font: inherit;
    font-size: 0.9rem;
    white-space: nowrap;
    color: inherit;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  .count:hover { border-bottom-color: var(--border); }
  .count[aria-pressed='true'] { border-bottom-color: var(--primary); }
  .count:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .count b {
    font-size: 1.4rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    margin-right: 0.15rem;
  }
  .count.focus b { color: var(--primary); }
  .dim { color: var(--muted-foreground); }
  .tnum { font-variant-numeric: tabular-nums; }
  .asof {
    margin: calc(-1 * var(--space-sm)) 0 0;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .find {
    position: relative; /* anchors the sr-only label (see .canvas) */
    flex: 1 1 14rem;
    max-width: 22rem;
  }
  .find input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--background);
    color: var(--foreground);
    padding: 0.35rem 0.6rem;
    font: inherit;
    font-size: 0.9rem;
  }
  .find input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
</style>
