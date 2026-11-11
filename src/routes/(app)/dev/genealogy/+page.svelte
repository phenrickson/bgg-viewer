<script lang="ts">
  /**
   * `/dev/genealogy` — one game's family tree over the embedding: earlier games like it
   * above, later ones below, same-year ones beside it, grown by unfolding (⊕) and
   * re-centring. Rules and encodings: docs/superpowers/specs/2026-10-12-game-genealogy-design.md.
   *
   * Laid out like `/map` (docs/superpowers/specs/2026-11-11-genealogy-presentation-design.md):
   * the same shell, the controls in a fixed sidebar card (one panel, so no tabs), and
   * everything else floating over the canvas in the map's HUD chrome — so nothing resizes the
   * canvas under the tree.
   *
   * All tree state lives in the URL: a re-centre is a shallow `pushState` (Back undoes it,
   * unfolds and all); everything else is a `replaceState`. Shallow routing leaves
   * `page.url` alone and carries the state in `page.state` (see `currentState`).
   *
   * All copy PLACEHOLDER (Phil writes the copy).
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { pushState, replaceState } from '$app/navigation';
  import { initCatalog, catalog } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import { loadGenealogyData } from '$lib/map/genealogy-data';
  import { buildGenealogy, expandKey, type Dir, type GenealogyInput, type Link } from '$lib/map/genealogy';
  import { layoutGenealogy } from '$lib/map/genealogy-layout';
  import { currentState, toParams, startAt, fold, showFewer, DEFAULT_CAP, T_MIN, T_MAX, type GenealogyState } from '$lib/map/genealogy-url';
  import { GAMES } from '$lib/map/story';
  import PointCanvas from '$lib/map/PointCanvas.svelte';
  import GenealogyLayer from '$lib/map/GenealogyLayer.svelte';
  import GenealogyRail from '$lib/map/GenealogyRail.svelte';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import { Container } from '$lib/components/ui/layout';
  import { Button } from '$lib/components/ui/button';
  import '$lib/map/hud.css';

  // --- data ------------------------------------------------------------------------------
  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let data = $state.raw<GenealogyInput | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const loaded = await loadMap();
      coords = loaded.coords;
      facts = loaded.facts;
      data = await loadGenealogyData(loaded.coords, loaded.facts);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // --- state (URL) -----------------------------------------------------------------------
  const s = $derived(currentState(page.state, page.url));
  function commit(next: GenealogyState, push = false) {
    const qs = toParams(next).toString();
    (push ? pushState : replaceState)(qs ? `?${qs}` : page.url.pathname, { genealogy: next });
  }

  const centreId = $derived(s.game ?? GAMES.agricola);
  const centre = $derived(coords?.index.get(centreId) ?? null);
  /**
   * `linked` memo — valid for one threshold, so a new one per threshold. Keyed on the
   * primitive: `s` is a fresh object on every commit, so depending on it would throw the
   * memo away on every unfold.
   */
  const threshold = $derived(s.t);
  const cache = $derived.by(() => { void threshold; return new Map<number, Link[]>(); });

  const tree = $derived.by(() => {
    if (!data || !coords || centre == null) return null;
    const index = coords.index;
    const unfolded = new Set(s.unfolded.map((id) => index.get(id)).filter((i): i is number => i != null));
    const expanded = new Set<string>();
    for (const key of s.expanded) {
      const [id, dir] = key.split(':');
      const i = index.get(Number(id));
      if (i != null) expanded.add(expandKey(i, dir as Dir));
    }
    return buildGenealogy({ ...data, cache }, centre, { threshold: s.t, cap: DEFAULT_CAP, unfolded, expanded, same: s.same });
  });
  const layout = $derived(tree && facts ? layoutGenealogy(tree, facts.year, s.y) : null);

  // --- interaction -----------------------------------------------------------------------
  /** Selected game's index; -1 for none. Not in the URL: it's a glance, not a place. */
  let selected = $state(-1);
  const selNode = $derived(tree?.nodes.find((nd) => nd.i === selected) ?? null);
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

  // PLACEHOLDER COPY (Phil)
  const DIRS = ['up', 'down', 'same'] as const;
  const MORE_LABEL: Record<Dir, string> = { up: 'earlier', down: 'later', same: 'same year' };
  const KIND_LABEL = { family: 'same family', influence: 'similarity only' } as const;
  const noEarlier = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'up') && tree.centreHidden.up === 0);
  const noLater = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'down') && tree.centreHidden.down === 0);
  const centreOverflow = $derived(!!tree && DIRS.some((dir) => isExpanded(tree.centre, dir) || tree.centreHidden[dir] > 0));
</script>

<Container size="wide" fill>
  <div class="workspace">
    <!-- One panel, so no tabs: the controls are simply always there, in the map's open-sidebar card. -->
    <aside class="side" aria-label="Controls">
      <GenealogyRail
        y={s.y}
        same={s.same}
        threshold={s.t}
        min={T_MIN}
        max={T_MAX}
        onaxis={(y) => commit({ ...s, y })}
        onsame={(same) => commit({ ...s, same })}
        onthreshold={(t) => commit({ ...s, t })}
      />
    </aside>

    <div class="canvas">
      {#if loadError}
        <div class="map-hud-state error">Couldn’t load: {loadError}</div>
      {:else if !coords || !facts || !data}
        <div class="map-hud-state">Loading {catalog.status === 'ready' ? 'embeddings' : 'catalog'}…</div>
      {:else if centre == null}
        <div class="map-hud-state">{facts.name(centreId)} isn’t in the embedding.</div>
      {:else if tree && !tree.placeable}
        <div class="map-hud-state">{facts.name(centreId)} has no year or no vector, so it can’t be placed in time.</div>
      {:else if layout}
        <PointCanvas lasso={false}>
          <GenealogyLayer {coords} {facts} {layout} {selected} onselect={(i) => (selected = i)} onunfold={unfold} onfold={foldAt} />
        </PointCanvas>
      {/if}

      <!-- Left: what you're looking at. Right: what acts on it. PLACEHOLDER COPY (Phil). -->
      {#if facts && tree && centre != null}
        <div class="map-hud-stack left">
          <div class="map-hud chosen">
            <b>{facts.name(centreId)}</b>
            {#if facts.year[centre]}<span class="dim tnum">{facts.year[centre]}</span>{/if}
          </div>
          <div class="map-hud">
            <span><b class="tnum">{tree.nodes.length}</b> <span class="dim">games</span></span>
            {#if s.unfolded.length || s.expanded.length}
              <button type="button" class="map-hud-chip" onclick={reset}>Reset</button>
            {/if}
          </div>
          {#if centreOverflow}
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

      <!-- The key: always on, bottom-left. PLACEHOLDER COPY (Phil). -->
      {#if layout}
        <div class="map-hud-stack left bottom">
          <div class="map-hud key" aria-label="Key">
            <span><i style:background="var(--primary)"></i> chosen</span>
            <span><i style:background="var(--map-cat-1)"></i> linked</span>
            <span><i class="hollow"></i> upcoming</span>
            <span class="sep" aria-hidden="true"></span>
            <span><b></b> similar</span>
            <span><b class="dashed"></b> same family</span>
            <span class="dim">size = ratings · thicker = more alike</span>
          </div>
        </div>
      {/if}

      <div class="map-hud-stack right">
        <div class="search"><GameSearch compact onpick={recentre} /></div>
        {#if selNode && facts && coords}
          {@const id = coords.ids[selNode.i]}
          <section class="map-hud-panel selected" aria-label="Selected game">
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
              {#if selNode.side !== 'centre'}<Button size="sm" onclick={() => recentre(id)}>Centre on this</Button>{/if}
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
          </section>
        {/if}
      </div>
    </div>
  </div>
</Container>

<style>
  /* /map's workspace: the sidebar its own width, the canvas the rest. */
  .workspace {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-md);
    height: 100%; min-height: 0;
  }
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
  .selected { width: 20rem; }
  .selected header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-sm); }
  .selected h2 { margin: 0; font-size: 1rem; line-height: 1.3; }
  .selected p { margin: 0; }
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
