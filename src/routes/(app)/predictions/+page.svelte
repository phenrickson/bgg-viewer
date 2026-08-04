<script lang="ts">
  /**
   * Predictions — sorting and surfacing upcoming games.
   *
   * The room is about the games; the model supplies the ordering. Same three regions as
   * Explore (rail → count + chips → table) so the two read as the same kind of place, and
   * the same in-browser DuckDB catalog underneath — no server hop on any interaction, and
   * no second artifact, because the catalog's working set already includes every game
   * published this year or later along with all five model columns.
   *
   * All copy is PLACEHOLDER — Phil writes the final strings.
   */
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import {
    DEFAULT_PREDICTION_SCOPE,
    scopeFromParams,
    scopeToParams,
    toWhere,
    upcomingWhere,
    yearWhere,
    type PredictionScope
  } from '$lib/predictions/scope';
  import PredictionRail from '$lib/predictions/PredictionRail.svelte';
  import PredictionChips from '$lib/predictions/PredictionChips.svelte';
  import PredictionTable from '$lib/predictions/PredictionTable.svelte';
  import { Container } from '$lib/components/ui/layout';

  let scope = $state<PredictionScope>({ ...DEFAULT_PREDICTION_SCOPE });
  let ready = $state(false);
  /** Publication years actually present, descending. Drives the rail's year dial. */
  let years = $state<number[]>([]);

  onMount(async () => {
    scope = scopeFromParams(new URLSearchParams(location.search));
    await initCatalog();
    ready = catalog.status === 'ready';
    if (!ready) return;

    /**
     * Which years exist is a fact about the data, not a constant: BGG carries entries dated
     * years ahead (there is a 2030 in there), and hardcoding a list would silently drop a
     * year the moment the warehouse gained one.
     */
    try {
      const rows = await query<{ y: number }>(
        `SELECT DISTINCT year_published::INT AS y FROM catalog
         WHERE ${upcomingWhere()} ORDER BY y`
      );
      years = rows.map((r) => r.y).filter((y) => Number.isFinite(y));
    } catch (e) {
      console.error('year list query failed', e);
    }

    // A year carried in on the URL wins; otherwise open on the current year if it has any
    // games, and fall back to the earliest year that does. Opening on an empty year would
    // show a page that looks broken on a data gap.
    if (scope.year == null || !years.includes(scope.year)) {
      const now = new Date().getFullYear();
      scope = { ...scope, year: years.includes(now) ? now : (years[0] ?? null) };
    }
  });

  const where = $derived(ready && scope.year != null ? toWhere(scope) : null);
  /** The year with every user filter dropped — what the count compares against. */
  const baseWhere = $derived(ready && scope.year != null ? yearWhere(scope) : null);

  // The one owner of the in-scope total, so the header and the table can't disagree.
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

  let yearTotal = $state<number | null>(null);
  let baseToken = 0;
  $effect(() => {
    if (baseWhere == null) return;
    const w = baseWhere;
    const mine = ++baseToken;
    query<{ n: number }>(`SELECT COUNT(*)::INT AS n FROM catalog WHERE ${w}`)
      .then((r) => mine === baseToken && (yearTotal = r[0]?.n ?? 0))
      .catch((e) => console.error('year count failed', e));
  });

  const narrowed = $derived(total != null && yearTotal != null && total < yearTotal);

  /**
   * When the model last spoke, and what it had seen — shown because a page of four-decimal
   * numbers that doesn't say when it looked is quietly overclaiming. `training_cutoff_year`
   * makes the "these are all forecasts" claim checkable rather than asserted.
   */
  let cutoff = $state<number | null>(null);
  $effect(() => {
    if (!ready) return;
    query<{ c: number | null }>(
      `SELECT MAX(training_cutoff_year)::INT AS c FROM catalog WHERE ${upcomingWhere()}`
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

  function clearAll() {
    // Keep the year: it is the population, not a filter, and clearing it would empty the page.
    scope = { ...DEFAULT_PREDICTION_SCOPE, year: scope.year, minHurdle: null };
  }
</script>

<svelte:head><title>Predictions · bgg-viewer</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn’t load the catalog: {catalog.error}</p>
{:else if !ready}
  <div class="state">
    <span class="spin"></span>
    <p>Loading the catalog into your browser — this happens once.</p>
  </div>
{:else if where != null && baseWhere != null}
  <Container size="wide" fill>
    <div class="workspace">
      <PredictionRail bind:scope {where} {years} />

      <div class="canvas">
        <div class="chead">
          <p class="count">
            <b class="tnum">{total?.toLocaleString() ?? '—'}</b>
            <span>{total === 1 ? 'game' : 'games'}</span>
            <span class="dim">
              coming in {scope.year}{#if narrowed}, of <span class="tnum">{yearTotal?.toLocaleString()}</span>{/if}
            </span>
          </p>
          <PredictionChips bind:scope onclear={clearAll} />
        </div>

        <PredictionTable {where} bind:scope />

        <!-- Provenance, not decoration. Every game here was published after the model's
             training cutoff, so every number on the page is a forecast rather than a fit —
             which is worth stating once, quietly, at the foot. -->
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

  /* Two independently scrolling columns, bounded by the shell's height — the same workspace
     grid Explore uses, so the two rooms sit at the same place on screen. */
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
