<script lang="ts">
  /**
   * `/lineage`: one game and what's around it over the embedding, as a Genealogy (earlier
   * games like it above, later ones below, same-year ones beside it, grown by unfolding (⊕)
   * and re-centring) or a Network (its neighbours, ring by ring), with a glide between the two.
   * Rules and encodings: docs/superpowers/specs/2026-10-12-game-genealogy-design.md and
   * docs/superpowers/specs/2026-11-11-genealogy-network-flip-design.md.
   *
   * Laid out like `/map` (docs/superpowers/specs/2026-11-11-genealogy-presentation-design.md):
   * the same shell, the controls in a fixed sidebar card (one panel, so no tabs), and
   * everything else floating over the canvas in the map's HUD chrome — so nothing resizes the
   * canvas under the tree.
   *
   * All tree state lives in the URL: a re-centre is a shallow `pushState` (Back undoes it,
   * unfolds and all); everything else is a `replaceState`. Shallow routing leaves
   * `page.url` alone and carries the state in `page.state` (see `currentState`).
   */
  import { onMount, onDestroy } from 'svelte';
  import { Glide } from '$lib/map/glide.svelte';
  import { page } from '$app/state';
  import { pushState, replaceState } from '$app/navigation';
  import { initCatalog, catalog } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { loadGenealogyData } from '$lib/map/genealogy-data';
  import { buildGenealogy, expandKey, famousStart, type Dir, type GenealogyInput, type LinkScan } from '$lib/map/genealogy';
  import { layoutGenealogy } from '$lib/map/genealogy-layout';
  import { currentState, toParams, startAt, fold, foldNet, showFewer, DEFAULT_CAP, K_MAX, type GenealogyState } from '$lib/map/genealogy-url';
  import { buildEgoNetwork, layoutEgoNetwork, type NetworkLayout } from '$lib/map/network';
  import { GAMES } from '$lib/map/story';
  import PointCanvas from '$lib/map/PointCanvas.svelte';
  import GenealogyLayer from '$lib/map/GenealogyLayer.svelte';
  import EgoLayer from '$lib/map/EgoLayer.svelte';
  import GenealogyRail from '$lib/map/GenealogyRail.svelte';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import { Container } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import * as Sheet from '$lib/components/ui/sheet';
  import '$lib/map/hud.css';

  // --- data ------------------------------------------------------------------------------
  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let data = $state.raw<GenealogyInput | null>(null);
  let loadError = $state<string | null>(null);
  /** The tool's motion — page-owned so it carries across the Genealogy ⇄ Network flip. */
  let glide = $state.raw<Glide | null>(null);
  onDestroy(() => glide?.stop());

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const loaded = await loadMap();
      coords = loaded.coords;
      facts = loaded.facts;
      glide = new Glide(loaded.coords.ids.length);
      const d = await loadGenealogyData(loaded.coords, loaded.facts);
      // No game in the URL (a visit from the menu): open on a well-known game at random, and
      // write it into the URL, so a reload or a shared link shows the same one.
      if (s.game == null) {
        const i = famousStart(d, loaded.facts.usersRated, loaded.facts.upcoming);
        if (i >= 0) commit({ ...s, game: loaded.coords.ids[i] });
      }
      data = d;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  /**
   * Narrow (a phone): no sidebar, so the canvas gets the width, and the controls open in a
   * bottom sheet instead, as on /map at the same breakpoint. With a fixed 17rem sidebar beside
   * it the canvas was left a sliver, too small to draw in. `matchMedia` rather than CSS, as
   * /map does, so the rail is rendered in one place at a time.
   */
  let narrow = $state(false);
  let controlsOpen = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 60rem)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
  // Leaving narrow with the sheet open would strand a modal over the desktop layout.
  $effect(() => {
    if (!narrow) controlsOpen = false;
  });

  // --- state (URL) -----------------------------------------------------------------------
  const s = $derived(currentState(page.state, page.url));
  function commit(next: GenealogyState, push = false) {
    const qs = toParams(next).toString();
    (push ? pushState : replaceState)(qs ? `?${qs}` : page.url.pathname, { genealogy: next });
  }

  /** Brass only if no well-known game could be drawn (see `famousStart` on load). */
  const centreId = $derived(s.game ?? GAMES.brass);
  const centre = $derived(coords?.index.get(centreId) ?? null);
  /**
   * `linked` scans, one per game, kept for the page's life: each holds every link down to the
   * slider's minimum, so a new threshold reads a prefix instead of rescanning the catalog.
   * Bounded: a scan can run to thousands of links, and every tree visited adds its games.
   */
  const cache = new Map<number, LinkScan>();
  const CACHE_GAMES = 2000;
  const threshold = $derived(s.t);

  const net = $derived(s.view === 'net');

  /**
   * What each view is built from, as primitives: `s` is a fresh object on every commit, so a
   * view reading it directly rebuilt (and re-glided, blinking its labels) on any setting at
   * all, a style toggle included. A derived primitive that hasn't changed stops that.
   */
  const unfoldedKey = $derived(s.unfolded.join(','));
  const expandedKey = $derived(s.expanded.join(','));
  const same = $derived(s.same);
  const yMode = $derived(s.y);
  const hops = $derived(s.hops);
  const openKey = $derived(s.open.join(','));
  const idList = (key: string) => (key ? key.split(',').map(Number) : []);

  const tree = $derived.by(() => {
    if (net || !data || !coords || centre == null) return null;
    const index = coords.index;
    const unfolded = new Set(idList(unfoldedKey).map((id) => index.get(id)).filter((i): i is number => i != null));
    const expanded = new Set<string>();
    for (const key of expandedKey ? expandedKey.split(',') : []) {
      const [id, dir] = key.split(':');
      const i = index.get(Number(id));
      if (i != null) expanded.add(expandKey(i, dir as Dir));
    }
    if (cache.size > CACHE_GAMES) cache.clear();
    return buildGenealogy({ ...data, cache }, centre, { threshold, cap: DEFAULT_CAP, unfolded, expanded, same });
  });
  const layout = $derived(tree && facts ? layoutGenealogy(tree, facts.year, yMode) : null);

  // --- the network view ------------------------------------------------------------------
  const k = $derived(s.k);
  /** Neighbour lists, one scan per game at the slider's largest k, so every k reads a prefix. */
  const netCache = new Map<number, { i: number; sim: number }[]>();
  const graph = $derived.by(() => {
    if (!net || !data || !facts || centre == null) return null;
    const f = facts, d = data, index = coords!.index;
    const open = new Set(idList(openKey).map((id) => index.get(id)).filter((i): i is number => i != null));
    // The bench's eligibility: a vector, and not upcoming (the centre is always in).
    return buildEgoNetwork(
      { n: d.n, dim: d.dim, emb: d.emb, cache: netCache, scanK: K_MAX, eligible: (i) => d.has(i) && f.upcoming[i] === 0 },
      centre,
      { k, hops, mutual: false, floor: threshold, open }
    );
  });
  /**
   * The last network layout, in simulation units — the next one starts from it, so a change of
   * k, rings or centre adjusts the graph rather than reshuffling it. Not state: it's a seed.
   */
  let netSeed: Map<number, [number, number]> | undefined;
  /** The seed's centre: on the same centre (a change of k, rings or floor) the games that stay are held in place. */
  let netSeedCentre = -1;
  const netLayout = $derived.by<NetworkLayout | null>(() => {
    if (!graph) return null;
    const out = layoutEgoNetwork(graph, (i) => (i === graph.source ? 8 : 5), netSeed, graph.source === netSeedCentre);
    netSeed = new Map(graph.nodes.map((nd, j) => [nd.i, [out.px[j], out.py[j]]]));
    netSeedCentre = graph.source;
    return out;
  });

  // --- interaction -----------------------------------------------------------------------
  /** Selected game's index; -1 for none. Not in the URL: it's a glance, not a place. */
  let selected = $state(-1);
  const selNode = $derived(tree?.nodes.find((nd) => nd.i === selected) ?? null);
  const netNode = $derived(graph?.nodes.find((nd) => nd.i === selected) ?? null);
  /** The count in the HUD, whichever view is on. */
  const shownCount = $derived(net ? (graph?.nodes.length ?? 0) : (tree?.nodes.length ?? 0));
  const idOf = (i: number) => coords!.ids[i];

  /** A new centre is a fresh tree; Back steps to the previous one. */
  function recentre(id: number) {
    if (id === centreId) return;
    selected = -1;
    commit(startAt(s, id), true);
  }
  /** Fold everything back to the centre's starting view. */
  function reset() {
    selected = -1;
    commit(startAt(s, centreId));
  }
  const unfold = (i: number) => commit({ ...s, unfolded: [...s.unfolded, idOf(i)] });
  const more = (i: number, dir: Dir) => commit({ ...s, expanded: [...s.expanded, `${idOf(i)}:${dir}`] });
  const isExpanded = (i: number, dir: Dir) => s.expanded.includes(`${idOf(i)}:${dir}`);
  const fewer = (i: number, dir: Dir) => commit(showFewer(s, idOf(i), dir));
  const foldAt = (i: number) => { if (tree) commit(fold(s, tree, coords!.ids, i)); };
  /** Network: expand one game past its ring, or fold it back. */
  const expandNet = (i: number) => commit({ ...s, open: [...s.open, idOf(i)] });
  const foldNetAt = (i: number) => { if (graph) commit(foldNet(s, graph.nodes, coords!.ids, i)); };

  const DIRS = ['up', 'down', 'same'] as const;
  const MORE_LABEL: Record<Dir, string> = { up: 'earlier', down: 'later', same: 'same year' };
  const KIND_LABEL = { family: 'same family', influence: 'similarity only' } as const;
  const noEarlier = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'up') && tree.centreHidden.up === 0);
  const noLater = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'down') && tree.centreHidden.down === 0);
  const centreOverflow = $derived(!!tree && DIRS.some((dir) => isExpanded(tree.centre, dir) || tree.centreHidden[dir] > 0));
</script>

<!-- The selected game's card contents, one per view; the layer pins them beside the game's dot
     (`PinnedCard`). -->
{#snippet treeCard()}
  {#if selNode && facts && coords}
    {@const id = coords.ids[selNode.i]}
    <header>
      <h2>{facts.name(id)}</h2>
      <button type="button" class="close" onclick={() => (selected = -1)} aria-label="Close">×</button>
    </header>
    <p class="dim">
      {facts.year[selNode.i] || '—'} · <span class="tnum">{facts.usersRated[selNode.i].toLocaleString()}</span> ratings{facts.upcoming[selNode.i] ? ' · upcoming' : ''}
    </p>
    {#if selNode.side !== 'centre' && selNode.kind}
      <p>{selNode.sim.toFixed(2)} to {facts.name(idOf(selNode.via))} · {KIND_LABEL[selNode.kind]}</p>
    {/if}
    <div class="actions">
      {#if selNode.side !== 'centre'}<Button size="sm" onclick={() => recentre(id)}>Center on this</Button>{/if}
      {#if selNode.side === 'up' || selNode.side === 'down'}
        {@const dir = selNode.side}
        {@const i = selNode.i}
        {#if selNode.unfolded}
          <Button size="sm" variant="outline" onclick={() => foldAt(i)}>Fold</Button>
          {#if isExpanded(i, dir)}
            <Button size="sm" variant="outline" onclick={() => fewer(i, dir)}>Show fewer</Button>
          {:else if selNode.hidden > 0}
            <Button size="sm" variant="outline" onclick={() => more(i, dir)}>Show {selNode.hidden} more</Button>
          {/if}
        {:else if selNode.hidden > 0}
          <Button size="sm" variant="outline" onclick={() => unfold(i)}>Unfold {selNode.hidden} {MORE_LABEL[dir]}</Button>
        {/if}
      {/if}
      <Button size="sm" variant="outline" href="/games/{id}">Game page</Button>
    </div>
  {/if}
{/snippet}

{#snippet netCard()}
  {#if netNode && facts && coords}
    {@const id = coords.ids[netNode.i]}
    <header>
      <h2>{facts.name(id)}</h2>
      <button type="button" class="close" onclick={() => (selected = -1)} aria-label="Close">×</button>
    </header>
    <p class="dim">
      {facts.year[netNode.i] || '—'} · <span class="tnum">{facts.usersRated[netNode.i].toLocaleString()}</span> ratings
    </p>
    {#if netNode.hop > 0}
      <p>{netNode.sim.toFixed(2)} to {facts.name(centreId)} · ring {netNode.hop}</p>
    {/if}
    <div class="actions">
      {#if netNode.hop > 0}<Button size="sm" onclick={() => recentre(id)}>Center on this</Button>{/if}
      {#if netNode.open}
        {@const i = netNode.i}
        <Button size="sm" variant="outline" onclick={() => foldNetAt(i)}>Fold</Button>
      {:else if netNode.more > 0}
        {@const i = netNode.i}
        <Button size="sm" variant="outline" onclick={() => expandNet(i)}>Expand {netNode.more} more</Button>
      {/if}
      <Button size="sm" variant="outline" href="/games/{id}">Game page</Button>
    </div>
  {/if}
{/snippet}

<Container size="wide" fill>
  <div class="workspace" class:narrow>
    <!-- One panel, so no tabs: the controls are simply always there, in the map's open-sidebar
         card. On narrow they're in the sheet below instead. -->
    {#if !narrow}
      <aside class="side" aria-label="Controls">
        <GenealogyRail {s} oncommit={(next) => commit(next)} />
      </aside>
    {/if}

    <div class="canvas">
      {#if loadError}
        <div class="map-hud-state error">Couldn’t load: {loadError}</div>
      {:else if !coords || !facts || !data}
        <div class="map-hud-state">Loading {catalog.status === 'ready' ? 'embeddings' : 'catalog'}…</div>
      {:else if centre == null}
        <div class="map-hud-state">{facts.name(centreId)} isn’t in the embedding.</div>
      {:else if !net && tree && !tree.placeable}
        <div class="map-hud-state">{facts.name(centreId)} has no year or no vector, so it can’t be placed in time.</div>
      {:else if net && !data.has(centre)}
        <!-- Without a vector every score is 0, so the floor leaves a lone dot. -->
        <div class="map-hud-state">{facts.name(centreId)} has no vector, so it has no network.</div>
      {:else if glide && (layout || netLayout)}
        <!-- One canvas for both views: a flip swaps the layer, and the Glide carries every game
             from its spot in one view to its spot in the other. -->
        <PointCanvas lasso={false}>
          {#if net && netLayout}
            <EgoLayer {coords} {facts} layout={netLayout} {glide} oneway={s.oneway} floor={s.t} {selected} card={netNode ? netCard : undefined}
              onselect={(i) => (selected = i)} onclear={() => (selected = -1)} />
          {:else if layout}
            <GenealogyLayer {coords} {facts} {layout} {glide} floor={s.t} {selected} card={selNode ? treeCard : undefined}
              onselect={(i) => (selected = i)} onclear={() => (selected = -1)} onunfold={unfold} onfold={foldAt} />
          {/if}
        </PointCanvas>
      {/if}

      <!-- Left: what you're looking at. Right: what acts on it. -->
      {#if facts && (tree || graph) && centre != null}
        <div class="map-hud-stack left">
          <div class="map-hud chosen">
            <b>{facts.name(centreId)}</b>
            {#if facts.year[centre]}<span class="dim tnum">{facts.year[centre]}</span>{/if}
          </div>
          <div class="map-hud">
            <span><b class="tnum">{shownCount}</b> <span class="dim">games</span></span>
            {#if (tree && (s.unfolded.length || s.expanded.length)) || (graph && s.open.length)}
              <button type="button" class="map-hud-chip" onclick={reset}>Reset</button>
            {/if}
          </div>
          {#if tree && centreOverflow}
            <!-- The centre's overflow: about the chosen game, not a spot on the tree. -->
            <div class="map-hud">
              {#each DIRS as dir (dir)}
                {#if isExpanded(tree.centre, dir)}
                  <button type="button" class="map-hud-chip" onclick={() => fewer(tree.centre, dir)}>Fewer {MORE_LABEL[dir]}</button>
                {:else if tree.centreHidden[dir] > 0}
                  <button type="button" class="map-hud-chip" onclick={() => more(tree.centre, dir)}>+{tree.centreHidden[dir]} {MORE_LABEL[dir]}</button>
                {/if}
              {/each}
            </div>
          {/if}
          {#if noEarlier}<div class="map-hud dim">No earlier games this alike.</div>{/if}
          {#if noLater}<div class="map-hud dim">No later games this alike.</div>{/if}
        </div>
      {/if}

      <!-- The key: always on, bottom-left. -->
      {#if layout || netLayout}
        <div class="map-hud-stack left bottom">
          <div class="map-hud key" aria-label="Key">
            <span><i style:background="var(--primary)"></i> chosen</span>
            <span><i style:background="var(--map-cat-1)"></i> linked</span>
            {#if !net}<span><i class="hollow"></i> upcoming</span>{/if}
            <span class="sep" aria-hidden="true"></span>
            {#if net}
              <span><b></b> similar</span>
              {#if s.oneway}<span><b class="dashed"></b> one-way</span>{/if}
            {:else}
              <span><b></b> similar</span>
              <span><b class="dashed"></b> same family</span>
            {/if}
            <span class="dim">size = ratings · thicker = more alike</span>
          </div>
        </div>
      {/if}

      <!-- Right: only the search now. The selected game's card is pinned beside its dot. -->
      <div class="map-hud-stack right">
        <div class="search"><GameSearch compact onpick={recentre} /></div>
        {#if narrow}
          <!-- The only way to the controls on narrow: the sidebar isn't rendered there. -->
          <Button size="sm" variant="outline" onclick={() => (controlsOpen = true)}>Controls</Button>
        {/if}
      </div>
    </div>
  </div>
</Container>

<!-- Narrow: the sidebar as a bottom sheet, as /map does; short of full height so a sliver of
     the canvas stays in view behind it. -->
<Sheet.Root bind:open={controlsOpen}>
  <Sheet.Content side="bottom" class="flex h-[85dvh] max-h-[85dvh] flex-col p-0">
    <Sheet.Header class="border-b border-border">
      <Sheet.Title>Controls</Sheet.Title>
    </Sheet.Header>
    <div class="min-h-0 flex-1 overflow-y-auto px-4">
      <GenealogyRail {s} oncommit={(next) => commit(next)} />
    </div>
    <Sheet.Footer class="border-t border-border">
      <Button size="lg" class="w-full" onclick={() => (controlsOpen = false)}>Show the games</Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<style>
  /* /map's workspace: the sidebar its own width, the canvas the rest. */
  .workspace {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-md);
    height: 100%; min-height: 0;
  }
  .workspace.narrow { grid-template-columns: minmax(0, 1fr); }
  /* On a phone the corners share the width: the left stack (the game, the count, its chips)
     and the right (search, Controls) take half each; the key gets the full width to wrap in. */
  .narrow .map-hud-stack.left:not(.bottom) { max-width: 48%; }
  .narrow .map-hud-stack.left.bottom { max-width: calc(100% - 2 * var(--space-sm)); }
  .narrow .search { min-width: 0; width: 100%; }
  /* The map's open sidebar card, minus the tab row it doesn't need. */
  .side {
    width: 17rem; min-height: 0; overflow-y: auto;
    padding: 0 var(--space-md);
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--card);
  }
  .canvas { position: relative; min-width: 0; min-height: 0; }
  .dim { color: var(--muted-foreground); }
  .tnum { font-variant-numeric: tabular-nums; }
  .chosen b { font-size: 1rem; }
  .search { min-width: min(16rem, 100%); }
  /* The pinned card's contents (the card itself is `PinnedCard`). */
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-sm); }
  h2 { margin: 0; font-size: 1rem; line-height: 1.3; }
  p { margin: 0; }
  .close {
    border: 0; background: none; padding: 0 0.2rem; cursor: pointer;
    color: var(--muted-foreground); font-size: 1rem; line-height: 1;
  }
  .close:hover { color: var(--foreground); }
  .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .key { flex-wrap: wrap; gap: 0.3rem 0.8rem; font-size: 0.75rem; max-width: min(40rem, 100%); }
  .key span { display: inline-flex; align-items: center; gap: 0.35rem; }
  .key i { width: 0.6rem; height: 0.6rem; border-radius: 50%; flex: none; }
  .key i.hollow { border: 1px dashed var(--foreground); }
  .key b { width: 1rem; height: 0; flex: none; border-top: 1.5px solid var(--foreground); }
  .key b.dashed { border-top-style: dashed; }
  .key .sep { width: 1px; height: 0.8rem; background: var(--border); }
</style>
