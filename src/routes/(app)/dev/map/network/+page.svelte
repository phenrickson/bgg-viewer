<script lang="ts">
  /**
   * `/dev/map/network` — prototype: one game's ego network, and the flight between it and
   * the map. Pick a game; its k nearest by cosine on the full 64-d vectors (the engine's
   * own measure) are hop 1, optionally their k nearest are hop 2, and an edge exists
   * wherever one lists another in its k. One `PointCanvas`, two layers: "Map" is the
   * `MapLayer` framed on those games; "Network" swaps in the `NetworkLayer`, whose force
   * layout places them by their edges only — mutual neighbours knot together, a neighbour
   * that only links to the centre hangs off alone — and the points travel between the two.
   *
   * Vectors come from the dev similarity dataset (`/dev/similar/dataset`). All copy
   * PLACEHOLDER.
   */
  import { onMount, untrack } from 'svelte';
  import { tableFromIPC } from 'apache-arrow';
  import { initCatalog, catalog, query } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { DEFAULT_VIEW, MIN_RATINGS_FLOOR, type ViewState } from '$lib/map/view';
  import { buildEgoNetwork, layoutEgoNetwork, type NetworkData } from '$lib/map/network';
  import { GAMES } from '$lib/map/story';
  import PointCanvas from '$lib/map/PointCanvas.svelte';
  import MapLayer from '$lib/map/MapLayer.svelte';
  import NetworkLayer from '$lib/map/NetworkLayer.svelte';

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
      const [loaded, res] = await Promise.all([loadMap(), fetch('/dev/similar/dataset')]);
      if (!res.ok) throw new Error(`embedding dataset fetch failed (${res.status})`);
      const t = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
      const ids = t.getChild('game_id')!.toArray() as Int32Array;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const col = t.getChild('embedding') as any;
      const n = loaded.coords.ids.length;
      const dim: number = col.get(0)?.length ?? 64;
      const emb = new Float32Array(n * dim);
      const have = new Uint8Array(n);
      for (let o = 0; o < t.numRows; o++) {
        const i = loaded.coords.index.get(ids[o]);
        if (i == null) continue;
        // A list cell is an Arrow Vector — `.get(d)` works, `[d]` doesn't.
        const v = (col.get(o)?.toArray() ?? null) as ArrayLike<number> | null;
        if (!v) continue;
        let norm = 0;
        for (let d = 0; d < dim; d++) norm += v[d] * v[d];
        norm = Math.sqrt(norm) || 1;
        for (let d = 0; d < dim; d++) emb[i * dim + d] = v[d] / norm;
        have[i] = 1;
      }
      const f = loaded.facts;
      coords = loaded.coords;
      facts = f;
      data = {
        n, dim, emb,
        eligible: (i) => have[i] === 1 && f.upcoming[i] === 0 && f.usersRated[i] >= untrack(() => minRatings)
      };
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // --- controls ----------------------------------------------------------------------------
  let sourceId = $state<number>(GAMES.brass);
  let k = $state(10);
  let hops = $state<1 | 2>(2);
  let mutual = $state(false);
  let oneWay = $state(false);
  // Same floor as the map, so the graph is built from the games the map shows.
  let minRatings = $state(MIN_RATINGS_FLOOR);
  let showNetwork = $state(false);
  let view = $state<ViewState>({ ...DEFAULT_VIEW, projection: 'umap', colour: 'category', size: 'uniform', selected: [] });
  $effect(() => { view.minRatings = minRatings; });

  const source = $derived(coords?.index.get(sourceId) ?? null);
  const graph = $derived.by(() => {
    if (!data || source == null) return null;
    void minRatings; // `eligible` reads it untracked; recompute when it moves
    return buildEgoNetwork(data, source, { k, hops, mutual });
  });
  const layout = $derived(graph ? layoutEgoNetwork(graph, (i) => (i === graph.source ? 8 : 5)) : null);
  const nodeIds = $derived(graph && coords ? graph.nodes.map((n) => coords!.ids[n.i]) : []);
  const near = $derived(graph && coords ? graph.nodes.filter((n) => n.hop <= 1).map((n) => coords!.ids[n.i]) : []);

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
      <h1>Ego network</h1>
      <p class="muted">Map tab: {view.projection === 'umap' ? 'UMAP' : `PC${view.x} × PC${view.y}`} · Network tab: force layout by edges</p>
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
    <div class="seg" role="group" aria-label="Arrangement">
      <button type="button" class:on={!showNetwork} onclick={() => (showNetwork = false)}>Map</button>
      <button type="button" class:on={showNetwork} onclick={() => (showNetwork = true)}>Network</button>
    </div>
    <label>Projection
      <select bind:value={view.projection}><option value="umap">UMAP</option><option value="pca">PCA</option></select>
    </label>
    <label>k <input type="range" min="4" max="25" bind:value={k} /> {k}</label>
    <label>Hops
      <select bind:value={hops}><option value={1}>1</option><option value={2}>2</option></select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={mutual} /> Mutual neighbours only</label>
    <label class="check"><input type="checkbox" bind:checked={oneWay} /> Show one-way edges</label>
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
        <PointCanvas>
          {#if showNetwork}
            <NetworkLayer {coords} {facts} {layout} {oneWay} onpick={pick} />
          {:else}
            <MapLayer
              {coords}
              {facts}
              {view}
              anchors={near}
              focus={nodeIds}
              onselectionchange={(ids) => { const id = ids.find((x) => !view.selected.includes(x)); if (id != null) pick(id); }}
            />
          {/if}
        </PointCanvas>
      {/if}
    </div>
  </div>
  <p class="muted foot">Map: the network's games framed where they sit on the map. Network: the same points arranged by their edges. Edge ink follows cosine similarity; solid = each lists the other, dashed = one-way. Click a game to centre on it. "Mutual neighbours only" changes the graph (one-way links are dropped before layout); "show one-way edges" only changes what's drawn.</p>
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
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .seg button { padding: 0.25rem 0.7rem; }
  .seg button.on { background: var(--primary); color: var(--primary-foreground); }
  .muted { color: var(--muted-foreground); font-size: 0.85rem; }
  .foot { margin: 0; }
  .body { flex: 1 1 auto; min-height: 0; display: flex; }
  .map { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; }
  .state { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-foreground); }
  .state.error { color: var(--destructive, var(--foreground)); }
</style>
