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
  import { countsSql, countSql, type Mode, type ListArgs } from '$lib/bggcon/queries';
  import LibraryRows from './LibraryRows.svelte';

  const REFRESH_MS = 60_000;
  const ready = $derived(catalog.status === 'ready');
  const narrowQuery = new MediaQuery('max-width: 40rem');
  const narrow = $derived(narrowQuery.current);
  let filtersOpen = $state(false);

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let mode = $state<Mode>('all');
  let availableNow = $state(false);
  let libraryIds = $state.raw<ReadonlySet<number>>(new Set());
  let loadError = $state<string | null>(null);
  let asOf = $state<string | null>(null);
  let stale = $state(false);
  let counts = $state<{ games: number; on_shelf: number; copies_out: number; not_in_catalog: number } | null>(null);
  let focusOnShelf = $state(0);

  onMount(() => {
    initCatalog();
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
  const args = $derived<ListArgs>(
    mode === 'missing'
      ? { mode: 'missing', q: scope.q, availableOnly: availableNow }
      : mode === 'focus' && !searching
        ? { mode: 'focus', ids: [...stars.ids], availableOnly: availableNow }
        : { mode: 'all', where: scopeWhere, availableOnly: availableNow }
  );

  // PLACEHOLDER copy (Phil): the view names and empty states.
  const MODE_OPTIONS: { value: Mode; label: string }[] = [
    { value: 'all', label: 'Whole library' },
    { value: 'focus', label: 'Focus list' },
    { value: 'missing', label: 'Not in catalog' }
  ];
  const emptyText = $derived(
    args.mode === 'focus'
      ? 'Your focus list is empty. Search, or switch to the whole library, and star games to watch them here.'
      : 'No library games match.'
  );
  const asOfText = $derived(
    asOf ? new Date(asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null
  );
</script>

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
          <Rail bind:scope where={railWhere} showUniverse={false} groupAdvanced bind:availableNow />
        </RailSheet>
      </div>
    {/if}

    <div class="workspace" class:narrow>
      {#if !narrow}
        <div class="sidebar">
          <Rail bind:scope where={railWhere} showUniverse={false} groupAdvanced bind:availableNow />
        </div>
      {/if}

      <div class="canvas">
        <div class="chead">
          {#if counts}
            <p class="count"><b class="tnum">{counts.games.toLocaleString()}</b> games <span class="dim">in the library</span></p>
            <p class="count"><b class="tnum">{counts.on_shelf.toLocaleString()}</b> available</p>
            <p class="count"><b class="tnum">{counts.copies_out.toLocaleString()}</b> copies out</p>
            <p class="count focus"><b class="tnum">{stars.count}</b> in your focus list <span class="dim">· {focusOnShelf} available</span></p>
            <p class="count"><b class="tnum">{counts.not_in_catalog.toLocaleString()}</b> not in the catalog</p>
          {/if}
          <span class="asof">
            {#if asOfText}As of {asOfText}{#if stale} · couldn’t refresh{/if} · refreshes every minute{/if}
          </span>
        </div>
        {#if stars.error}<p class="state err">{stars.error}</p>{/if}

        <div class="ctl">
          <SegmentedControl label="Show" size="md" options={MODE_OPTIONS} value={mode} onchange={(v) => (mode = v)} />
          <FilterChips bind:scope onclear={() => (scope = { ...DEFAULT_SCOPE })} />
        </div>

        <LibraryRows {args} {libraryIds} {asOf} empty={emptyText} />
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
    overflow-y: auto;
    container-type: inline-size;
    /* The scroll area must be the containing block for absolutely positioned descendants (the
       rows' screen-reader labels). Without it they're placed against the page, deep down the
       list, and stretch the whole page into empty space below the footer. */
    position: relative;
  }
  /* Header, controls and list share one capped column, so nothing floats to the far edge. */
  .canvas > :global(*) {
    max-width: 56rem;
  }
  .chead {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm) var(--space-lg);
    flex-wrap: wrap;
  }
  .count {
    margin: 0;
    font-size: 0.9rem;
    white-space: nowrap;
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
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  .ctl {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }
</style>
