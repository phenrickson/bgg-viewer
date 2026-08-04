<script lang="ts">
  /**
   * Predictions — sorting and surfacing upcoming games.
   *
   * The room is about the games; the model supplies the ordering.
   *
   * This is Explore's workspace with the universe pinned to `upcoming`, and it shares every
   * part: the same `Scope`, the same `Rail`, the same `FilterChips`, the same `GameList`. An
   * earlier pass built parallel `PredictionScope` / `PredictionRail` / `PredictionChips` /
   * `PredictionTable` modules on the theory that the populations were too different to
   * share, which bought a second copy of the chip row, the rail chrome and the paging logic
   * to keep in sync, and quietly dropped families, artists and the name search along the
   * way. They are not too different: every numeric filter has a predicted twin, so the
   * universe decides which column each filter and each column *reads* and everything else is
   * the same question asked of a different population.
   *
   * What is left here is only what genuinely differs from `/games`: the universe is fixed,
   * the page says what it is, and the foot states the model's provenance.
   *
   * All copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_SCOPE,
    DEFAULT_HURDLE_MIN,
    toWhere,
    scopeToParams,
    scopeFromParams,
    type Scope
  } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import FilterChips from '$lib/catalog/FilterChips.svelte';
  import GameList from '$lib/catalog/views/GameList.svelte';
  import { Container } from '$lib/components/ui/layout';

  const PREDICTIONS_SCOPE: Scope = {
    ...DEFAULT_SCOPE,
    universe: 'upcoming',
    hurdleMin: DEFAULT_HURDLE_MIN
  };

  let scope = $state<Scope>({ ...PREDICTIONS_SCOPE });
  let ready = $state(false);

  onMount(async () => {
    // A URL can carry any scope, but this route is the upcoming universe by definition —
    // arriving at /predictions?u=rated would show the rated catalog under a heading that
    // says otherwise. The dial in the rail is still live: switching it there navigates the
    // same workspace, which is the seam Discover and Explore already share.
    scope = { ...scopeFromParams(new URLSearchParams(location.search)), universe: 'upcoming' };
    await initCatalog();
    ready = catalog.status === 'ready';
  });

  const where = $derived(ready ? toWhere(scope) : null);
  /** The universe with every user filter dropped — what the count compares against. */
  const baseWhere = $derived(
    ready ? toWhere({ ...DEFAULT_SCOPE, universe: 'upcoming', hurdleMin: null }) : null
  );

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

  let universeTotal = $state<number | null>(null);
  let baseToken = 0;
  $effect(() => {
    if (baseWhere == null) return;
    const w = baseWhere;
    const mine = ++baseToken;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`)
      .then((r) => mine === baseToken && (universeTotal = r[0]?.n ?? 0))
      .catch((e) => console.error('universe count failed', e));
  });

  const narrowed = $derived(total != null && universeTotal != null && total < universeTotal);

  /**
   * What the model had seen. A page of two-decimal numbers that never says when it looked or
   * what it was fitted on is quietly overclaiming; `training_cutoff_year` makes the "these
   * are all forecasts" claim checkable rather than asserted.
   */
  let cutoff = $state<number | null>(null);
  $effect(() => {
    if (!ready || baseWhere == null) return;
    query<{ c: number | null }>(
      `SELECT MAX(training_cutoff_year)::INT AS c FROM catalog WHERE ${baseWhere}`
    )
      .then((r) => (cutoff = r[0]?.c ?? null))
      .catch((e) => console.error('cutoff query failed', e));
  });

  // Mirror the scope to the URL (shareable, reload-safe) without a navigation.
  $effect(() => {
    if (!ready) return;
    const qs = scopeToParams(scope).toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });
</script>

<svelte:head><title>Predictions · bgg-viewer</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn’t load the catalog: {catalog.error}</p>
{:else if !ready}
  <div class="state">
    <span class="spin"></span>
    <p>Loading the catalog into your browser — this happens once.</p>
  </div>
{:else if where != null}
  <Container size="wide" fill>
    <div class="workspace">
      <Rail bind:scope {where} />

      <div class="canvas">
        <div class="chead">
          <p class="count">
            <b class="tnum">{total?.toLocaleString() ?? '—'}</b>
            <span>{total === 1 ? 'game' : 'games'}</span>
            <span class="dim">
              {#if narrowed}
                of <span class="tnum">{universeTotal?.toLocaleString()}</span> coming
              {:else}
                coming
              {/if}
            </span>
          </p>
          <FilterChips bind:scope onclear={() => (scope = { ...PREDICTIONS_SCOPE })} />
        </div>

        <GameList {where} universe={scope.universe} />

        <!-- Provenance, not decoration. Every game here was published after the model's
             training cutoff, so every number on the page is a forecast rather than a fit. -->
        <p class="prov">
          Model forecasts{#if cutoff}, from models fitted through <b>{cutoff}</b>{/if}. Every game
          on this page was announced after that, so none of them were in the training data.
        </p>
      </div>
    </div>
  </Container>
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

  /* The same workspace grid Explore uses, so the two rooms sit at the same place on screen. */
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

  .prov {
    margin: 0;
    flex: none;
    font-size: 0.74rem;
    color: var(--muted-foreground);
  }
  .prov b {
    color: var(--foreground);
    font-weight: 600;
  }

  @media (max-width: 900px) {
    .workspace {
      grid-template-columns: 1fr;
      height: auto;
    }
    .workspace :global(.rail) {
      max-height: 20rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-md);
    }
  }
</style>
