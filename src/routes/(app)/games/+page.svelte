<script lang="ts">
  import { onMount } from 'svelte';
  import { initCatalog, query, catalog } from '$lib/catalog/catalog.svelte';
  import { DEFAULT_SCOPE, toWhere, scopeToParams, scopeFromParams, type Scope } from '$lib/catalog/scope';
  import Rail from '$lib/catalog/Rail.svelte';
  import Overview from '$lib/catalog/views/Overview.svelte';
  import Table from '$lib/catalog/views/Table.svelte';

  type Facet = { c: string; n: number };
  type View = 'overview' | 'table';

  let scope = $state<Scope>({ ...DEFAULT_SCOPE });
  let view = $state<View>('overview');
  let categories = $state<Facet[]>([]);
  let mechanics = $state<Facet[]>([]);
  let ready = $state(false);

  onMount(async () => {
    const params = new URLSearchParams(location.search);
    scope = scopeFromParams(params);
    if (params.get('view') === 'table') view = 'table';
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

  // Mirror scope + view to the URL (shareable, reload-safe) without a navigation.
  $effect(() => {
    if (!ready) return;
    const p = scopeToParams(scope);
    if (view !== 'overview') p.set('view', view);
    const qs = p.toString();
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
        <div class="views" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === 'overview'} class:on={view === 'overview'} onclick={() => (view = 'overview')}>Overview</button>
          <button role="tab" aria-selected={view === 'table'} class:on={view === 'table'} onclick={() => (view = 'table')}>Table</button>
        </div>
        <span class="muted">filtered in-browser</span>
      </div>

      {#if where != null}
        {#if view === 'overview'}
          <Overview {where} />
        {:else}
          <Table {where} />
        {/if}
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
  .views { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .views button { background: var(--card); border: none; cursor: pointer; font: inherit; font-size: 0.82rem; color: var(--muted-foreground); padding: .35rem .9rem; }
  .views button + button { border-left: 1px solid var(--border); }
  .views button.on { background: var(--primary); color: var(--primary-foreground); font-weight: 600; }
</style>
