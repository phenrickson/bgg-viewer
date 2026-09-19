<script lang="ts">
  /**
   * `/dev/map/network/sigma` — the same ego network drawn by Sigma.js, for comparison with
   * the regl layer at `/dev/map/network`: same graph, same layout, different renderer.
   *
   * Vectors come from the dev similarity dataset (`/dev/similar/dataset`). All copy
   * PLACEHOLDER.
   */
  import { onMount, untrack } from 'svelte';
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { DEFAULT_VIEW, MIN_RATINGS_FLOOR, type ViewState } from '$lib/map/view';
  import { buildEgoNetwork, layoutEgoNetwork, type NetworkData } from '$lib/map/network';
  import { loadNetworkData } from '$lib/map/network-data';
  import { GAMES } from '$lib/map/story';
  import SigmaNetwork from '$lib/map/SigmaNetwork.svelte';

  // --- data ------------------------------------------------------------------------------
  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  /** Vectors aligned to `coords` order, so a graph index is a coords index. */
  let data = $state<NetworkData | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const loaded = await loadMap();
      coords = loaded.coords;
      facts = loaded.facts;
      data = await loadNetworkData(loaded.coords, loaded.facts, () => untrack(() => minRatings));
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // --- controls ----------------------------------------------------------------------------
  let sourceId = $state<number>(GAMES.brass);
  let k = $state(10);
  let hops = $state<1 | 2 | 3>(2);
  let mutual = $state(false);
  let oneWay = $state(false);
  let curvature = $state(0.18);
  let minSim = $state(0);
  let live = $state(true);
  // Same floor as the map, so the graph is built from the games the map shows.
  let minRatings = $state(MIN_RATINGS_FLOOR);
  let view = $state<ViewState>({ ...DEFAULT_VIEW, projection: 'umap', colour: 'category', size: 'uniform', selected: [] });
  $effect(() => { view.minRatings = minRatings; });

  const source = $derived(coords?.index.get(sourceId) ?? null);
  // Neighbour lists are memoised across re-centres; the memo is only valid for one
  // (k, ratings floor), so it's rebuilt when either moves.
  const cache = $derived.by(() => { void k; void minRatings; return new Map<number, { i: number; sim: number }[]>(); });
  const graph = $derived.by(() => {
    if (!data || source == null) return null;
    return buildEgoNetwork({ ...data, cache }, source, { k, hops, mutual });
  });
  const layout = $derived(graph ? layoutEgoNetwork(graph, (i) => (i === graph.source ? 8 : 5)) : null);

  // --- search (same shape as /dev/map) ---------------------------------------------------
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
        `SELECT game_id, name, year_published FROM catalog WHERE name ILIKE '%${esc}%' ORDER BY users_rated DESC LIMIT 8`
      );
    }, 120);
  }
  function pick(id: number) { q = ''; hits = []; sourceId = id; }
</script>

<div class="page">
  <header class="top">
    <div>
      <p class="eyebrow">Dev only — prototype</p>
      <h1>Ego network — Sigma.js</h1>
      <p class="muted">Same graph and layout as <a href="/dev/map/network">the regl version</a>; different renderer.</p>
    </div>
    <div class="search">
      <input type="search" placeholder="Centre on a game…" bind:value={q} oninput={onsearch} aria-label="Centre on a game" />
      {#if hits.length}
        <ul class="hits" role="listbox">
          {#each hits as h (h.game_id)}
            <li><button type="button" onclick={() => pick(h.game_id)}>{h.name} <span>{h.year_published ?? ''}</span></button></li>
          {/each}
        </ul>
      {/if}
    </div>
  </header>

  <div class="controls">
    <label>k <input type="range" min="4" max="25" bind:value={k} /> {k}</label>
    <label>Hops
      <select bind:value={hops}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={mutual} /> Mutual neighbours only</label>
    <label class="check"><input type="checkbox" bind:checked={oneWay} /> Show one-way edges</label>
    <label>Curve <input type="range" min="0" max="0.5" step="0.01" bind:value={curvature} /> {curvature.toFixed(2)}</label>
    <label>Min similarity <input type="range" min="0" max="1" step="0.01" bind:value={minSim} /> {minSim.toFixed(2)}</label>
    <label class="check"><input type="checkbox" bind:checked={live} /> Live layout (drag nodes)</label>
    <label>Min ratings <input type="range" min={MIN_RATINGS_FLOOR} max="2000" step="10" bind:value={minRatings} /> {minRatings}</label>
    {#if graph}
      <span class="muted">{graph.nodes.length} games · {graph.edges.length} edges · {graph.edges.filter((e) => e.mutual).length} mutual</span>
    {/if}
  </div>

  <div class="body">
    <div class="map">
      {#if loadError}
        <div class="state error">Couldn’t load: {loadError}</div>
      {:else if !coords || !facts || !layout}
        <div class="state">Loading {catalog.status === 'ready' ? 'embeddings' : 'catalog'}…</div>
      {:else}
        <SigmaNetwork {coords} {facts} {layout} {oneWay} {curvature} {minSim} {live} onpick={pick} />
      {/if}
    </div>
  </div>
  <p class="muted foot">Sigma.js renderer: anti-aliased curved edges, its own label grid (no overlaps by construction), hover dims the rest. Click a game to centre on it.</p>
</div>

<style>
  .page { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
  .top { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
  .eyebrow { color: var(--muted-foreground); font-size: 0.8rem; margin: 0; }
  h1 { margin: 0; }
  .search { position: relative; min-width: min(20rem, 100%); }
  .search input { width: 100%; }
  .hits {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 10; margin: 0.25rem 0 0; padding: 0.25rem; list-style: none;
    background: var(--popover); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  }
  .hits button { display: flex; justify-content: space-between; gap: 1rem; width: 100%; padding: 0.35rem 0.5rem; text-align: left; border-radius: calc(var(--radius) - 2px); }
  .hits button:hover, .hits button:focus-visible { background: var(--muted); }
  .hits span { color: var(--muted-foreground); }
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: center; font-size: 0.9rem; }
  .controls label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .controls select { color: var(--foreground); }
  .muted { color: var(--muted-foreground); font-size: 0.85rem; }
  .foot { margin: 0; }
  .body { flex: 1 1 auto; min-height: 0; display: flex; }
  .map { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; }
  .state { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-foreground); }
  .state.error { color: var(--destructive, var(--foreground)); }
</style>
