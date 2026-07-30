<script lang="ts">
  /**
   * Explore — the workspace. Three regions, and the reading order is the job order:
   *
   *   rail (what's in the set) → count + chips (what I asked for) → shape (what the set
   *   looks like) → list (the games) → a row (one game).
   *
   * The Table|Summary lens is gone. Shape and games no longer take turns: the strip is a
   * permanent ~5rem band that both *shows* the set's distributions and *is* the control for
   * them, so nothing about the set is hidden behind a click and the rail sheds four number
   * inputs. Everything still runs against the in-browser DuckDB catalog — no server hop on
   * any interaction.
   */
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
    toWhere,
    universeWhere,
    scopeToParams,
    scopeFromParams,
    type Scope
  } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import FilterChips from '$lib/catalog/FilterChips.svelte';
  import ShapeStrip from '$lib/catalog/views/ShapeStrip.svelte';
  import GameList from '$lib/catalog/views/GameList.svelte';

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let ready = $state(false);

  onMount(async () => {
    scope = scopeFromParams(new URLSearchParams(location.search));
    await initCatalog();
    ready = catalog.status === 'ready';
  });

  const where = $derived(ready ? toWhere(scope) : null);
  /** The universe with filters stripped — the strip's comparison population. */
  const baseWhere = $derived(ready ? universeWhere(scope) : null);

  // The one owner of the in-scope total, so the header and the list can't disagree.
  let total = $state<number | null>(null);
  let countToken = 0;
  $effect(() => {
    if (where == null) return;
    const w = where;
    const mine = ++countToken;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`)
      .then((r) => mine === countToken && (total = r[0]?.n ?? 0))
      .catch((e) => console.error('count failed', e));
  });

  // The universe total, so the header can say "1,284 of 10,000" — a filter's effect is only
  // legible against what it started from.
  let universeTotal = $state<number | null>(null);
  let baseCountToken = 0;
  $effect(() => {
    if (baseWhere == null) return;
    const w = baseWhere;
    const mine = ++baseCountToken;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`)
      .then((r) => mine === baseCountToken && (universeTotal = r[0]?.n ?? 0))
      .catch((e) => console.error('universe count failed', e));
  });

  const universeLabel = $derived(scope.universe === 'top10k' ? 'the top 10,000' : 'all rated games');
  const narrowed = $derived(total != null && universeTotal != null && total < universeTotal);

  // Mirror the scope to the URL (shareable, reload-safe) without a navigation. Also the
  // handoff to the detail page: `Back to results` there reads this querystring back.
  $effect(() => {
    if (!ready) return;
    const qs = scopeToParams(scope).toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
    try {
      sessionStorage.setItem('explore:qs', qs);
    } catch {
      // private-mode / storage-disabled: the back link just falls back to a bare /games
    }
  });
</script>

<svelte:head><title>Explore · bgg-viewer</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn’t load the catalog: {catalog.error}</p>
{:else if !ready}
  <div class="state">
    <span class="spin"></span>
    <p>Loading the catalog into your browser — this happens once.</p>
  </div>
{:else if where != null && baseWhere != null}
  <div class="workspace">
    <Rail bind:scope {where} />

    <div class="canvas">
      <div class="chead">
        <p class="count">
          <b class="tnum">{total?.toLocaleString() ?? '—'}</b>
          <span>{total === 1 ? 'game' : 'games'}</span>
          <span class="dim">
            {#if narrowed}
              of <span class="tnum">{universeTotal?.toLocaleString()}</span>
            {:else}
              in {universeLabel}
            {/if}
          </span>
        </p>
        <FilterChips bind:scope onclear={() => (scope = { ...DEFAULT_SCOPE, universe: scope.universe })} />
      </div>

      <ShapeStrip {where} {baseWhere} bind:scope />
      <GameList {where} />
    </div>
  </div>
{/if}

<style>
  .state {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--muted-foreground);
  }
  .state p {
    margin: 0;
  }
  .state.err {
    color: var(--color-negative);
  }
  .spin {
    width: 0.9rem;
    height: 0.9rem;
    flex: none;
    border-radius: 50%;
    border: 2px solid color-mix(in oklch, var(--primary) 35%, var(--border));
    border-top-color: var(--primary);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }

  /* Two independently scrolling columns, each bounded by the shell's height — so a long
     facet list never pushes the games off the screen. */
  .workspace {
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    gap: var(--space-lg);
    height: 100%;
    min-height: 0;
  }
  .canvas {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    min-width: 0;
    min-height: 0;
    /* The list's column set responds to the canvas, not the viewport. */
    container-type: inline-size;
  }

  .chead {
    display: flex;
    align-items: baseline;
    gap: var(--space-lg);
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
  .count .dim {
    color: var(--muted-foreground);
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  /* Below the two-column threshold the workspace becomes an ordinary scrolling document. */
  @media (max-width: 900px) {
    .workspace {
      grid-template-columns: 1fr;
      height: auto;
    }
  }
</style>
