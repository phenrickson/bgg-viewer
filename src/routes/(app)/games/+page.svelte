<script lang="ts">
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere, scopeToParams, scopeFromParams, type Scope } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import HeadlinePlot from '$lib/catalog/views/HeadlinePlot.svelte';
  import Table from '$lib/catalog/views/Table.svelte';
  import SetSummary from '$lib/catalog/views/SetSummary.svelte';

  type Facet = { c: string; n: number };

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let categories = $state<Facet[]>([]);
  let mechanics = $state<Facet[]>([]);
  let ready = $state(false);

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    scope = scopeFromParams(params);
    await initCatalog();
    if (catalog.status !== 'ready') return;
    // UNNEST must be produced in a subquery before GROUP BY in DuckDB.
    const facetSql = (col: string) =>
      `SELECT c, COUNT(*)::INT AS n FROM (SELECT UNNEST(${col}) AS c FROM catalog) GROUP BY c ORDER BY n DESC LIMIT 15`;
    try {
      categories = await query<Facet>(facetSql('categories'));
      mechanics = await query<Facet>(facetSql('mechanics'));
    } catch (e) {
      console.error('facet load failed', e); // non-critical — still show the workspace
    }
    ready = true;
  });

  const where = $derived(ready ? toWhere(scope) : null);

  // Mirror scope to the URL (shareable, reload-safe) without a navigation.
  $effect(() => {
    if (!ready) return;
    const qs = scopeToParams(scope).toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });
</script>

<svelte:head><title>Explore · bgg-viewer</title></svelte:head>

{#if catalog.status === 'error'}
  <p class="state err">Couldn't load the catalog: {catalog.error}</p>
{:else if !ready}
  <p class="state">Loading the catalog into your browser…</p>
{:else}
  <div class="workspace">
    <Rail bind:scope {categories} {mechanics} onreset={() => (scope = { ...DEFAULT_SCOPE })} />

    <div class="canvas">
      <div class="canvas-h">
        <span class="muted">Explore · filtered in-browser</span>
      </div>

      {#if where != null}
        <!-- The scoped set, understood then browsed: the plot (games, spatially) + the
             summary vizs characterize the set; the table lists the games themselves. -->
        <div class="stack">
          <HeadlinePlot {where} />

          <SetSummary {where} />

          <section>
            <h4 class="sect">Table <span class="sub">· the same games, as rows</span></h4>
            <Table {where} />
          </section>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .state { color: var(--muted-foreground); }
  .state.err { color: var(--color-negative); }
  .workspace { display: grid; grid-template-columns: 15rem 1fr; gap: var(--space-lg); align-items: start; }
  @media (max-width: 760px) { .workspace { grid-template-columns: 1fr; } }
  .canvas { min-width: 0; }
  .canvas-h { display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap; margin-bottom: var(--space-md); }
  .muted { color: var(--muted-foreground); font-size: 0.82rem; }
  .stack { display: flex; flex-direction: column; gap: var(--space-lg); min-width: 0; }
  .sect { margin: 0 0 var(--space-sm); font-size: 0.82rem; font-weight: 650; }
  .sect .sub { font-size: 0.7rem; color: var(--muted-foreground); font-weight: 400; }
</style>
