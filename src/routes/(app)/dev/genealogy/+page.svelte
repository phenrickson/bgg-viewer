<script lang="ts">
  /**
   * `/dev/genealogy` — one game's family tree over the embedding: earlier games like it
   * above, later ones below, same-year ones beside it, grown by unfolding (⊕) and
   * re-centring. Rules and encodings: docs/superpowers/specs/2026-10-12-game-genealogy-design.md.
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
  import { currentState, toParams, trailView, fold, showFewer, DEFAULT_CAP, T_MIN, T_MAX, type GenealogyState } from '$lib/map/genealogy-url';
  import { GAMES } from '$lib/map/story';
  import PointCanvas from '$lib/map/PointCanvas.svelte';
  import GenealogyLayer from '$lib/map/GenealogyLayer.svelte';
  import GameSearch from '$lib/catalog/GameSearch.svelte';
  import SegGroup from '$lib/catalog/rail/SegGroup.svelte';
  import { Button } from '$lib/components/ui/button';

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

  function recentre(id: number) {
    if (id === centreId) return;
    selected = -1;
    commit({ ...s, game: id, unfolded: [], expanded: [], trail: [...s.trail, centreId] }, true);
  }
  /** Breadcrumb: the last few centres, the rest behind "… N more" until opened. */
  let trailOpen = $state(false);
  const crumbs = $derived(trailView(s.trail, trailOpen));
  function crumb(k: number) {
    selected = -1;
    commit({ ...s, game: s.trail[k], unfolded: [], expanded: [], trail: s.trail.slice(0, k) }, true);
  }
  const unfold = (i: number) => commit({ ...s, unfolded: [...s.unfolded, idOf(i)] });
  const more = (i: number, dir: Dir) => commit({ ...s, expanded: [...s.expanded, `${idOf(i)}:${dir}`] });
  const isExpanded = (i: number, dir: Dir) => s.expanded.includes(`${idOf(i)}:${dir}`);
  const fewer = (i: number, dir: Dir) => commit(showFewer(s, idOf(i), dir));
  const foldAt = (i: number) => { if (tree) commit(fold(s, tree, coords!.ids, i)); };

  // PLACEHOLDER COPY (Phil)
  const DIRS = ['up', 'down', 'same'] as const;
  const MORE_LABEL: Record<Dir, string> = { up: 'earlier', down: 'later', same: 'same year' };
  const KIND_LABEL = { related: 'reimplementation / expansion', family: 'same family', influence: 'similarity only' } as const;
  const noEarlier = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'up') && tree.centreHidden.up === 0);
  const noLater = $derived(!!tree && !tree.nodes.some((nd) => nd.side === 'down') && tree.centreHidden.down === 0);
</script>

<div class="page">
  <header class="top">
    <div>
      <p class="eyebrow">Dev only — prototype</p>
      <h1>Genealogy</h1>
      {#if facts}
        <nav class="trail" aria-label="Trail">
          {#if crumbs.hidden}
            <button type="button" class="more" onclick={() => (trailOpen = true)}>… {crumbs.hidden} more</button><span aria-hidden="true">›</span>
          {/if}
          {#each crumbs.shown as c (c.k)}
            <button type="button" title={facts.name(c.id)} onclick={() => crumb(c.k)}>{facts.name(c.id)}</button><span aria-hidden="true">›</span>
          {/each}
          <strong title={facts.name(centreId)}>{facts.name(centreId)}</strong>
        </nav>
      {/if}
    </div>
    <div class="search"><GameSearch compact onpick={recentre} /></div>
  </header>

  <div class="controls">
    <!-- SegGroup's buttons share their container's width (built for the rail column), so
         inline in a row it needs a width to share. -->
    <div class="axis">
      <SegGroup
        ariaLabel="Vertical axis"
        options={[{ value: 'year', label: 'Year' }, { value: 'gen', label: 'Generation' }]}
        value={s.y}
        onchange={(y) => commit({ ...s, y })}
      />
    </div>
    <!-- PLACEHOLDER COPY (Phil) -->
    <label><input type="checkbox" checked={s.same} onchange={(e) => commit({ ...s, same: e.currentTarget.checked })} /> Same year</label>
    <label>Similarity ≥
      <input type="range" min={T_MIN} max={T_MAX} step="0.01" value={s.t}
        onchange={(e) => commit({ ...s, t: Number(e.currentTarget.value) })} />
      {s.t.toFixed(2)}
    </label>
    {#if tree}
      <span class="muted">{tree.nodes.length} games</span>
      <!-- The centre's overflow: about the chosen game, not a spot on the tree. -->
      {#each DIRS as dir (dir)}
        {#if isExpanded(tree.centre, dir)}
          <Button size="xs" variant="outline" onclick={() => fewer(tree.centre, dir)}>Show fewer {MORE_LABEL[dir]}</Button>
        {:else if tree.centreHidden[dir] > 0}
          <Button size="xs" variant="outline" onclick={() => more(tree.centre, dir)}>+{tree.centreHidden[dir]} {MORE_LABEL[dir]}</Button>
        {/if}
      {/each}
    {/if}
  </div>

  <div class="body">
    <div class="canvas">
      {#if loadError}
        <div class="state error">Couldn’t load: {loadError}</div>
      {:else if !coords || !facts || !data}
        <div class="state">Loading {catalog.status === 'ready' ? 'embeddings' : 'catalog'}…</div>
      {:else if centre == null}
        <div class="state">{facts.name(centreId)} isn’t in the embedding.</div>
      {:else if tree && !tree.placeable}
        <div class="state">{facts.name(centreId)} has no year or no vector, so it can’t be placed in time.</div>
      {:else if layout}
        <PointCanvas lasso={false}>
          <GenealogyLayer {coords} {facts} {layout} {selected} onselect={(i) => (selected = i)} onunfold={unfold} onfold={foldAt} />
        </PointCanvas>
        {#if noEarlier}<p class="empty above">No earlier games above this similarity.</p>{/if}
        {#if noLater}<p class="empty below">No later games above this similarity.</p>{/if}
      {/if}
    </div>

    {#if selNode && facts && coords}
      {@const id = coords.ids[selNode.i]}
      <aside class="side" aria-label="Selected game">
        <h2>{facts.name(id)}</h2>
        <p class="muted">
          {facts.year[selNode.i] || '—'} · {facts.usersRated[selNode.i].toLocaleString()} ratings{facts.upcoming[selNode.i] ? ' · upcoming' : ''}
        </p>
        {#if selNode.side !== 'centre' && selNode.kind}
          <p>Linked to {facts.name(idOf(selNode.via))} at {selNode.sim.toFixed(2)} — {KIND_LABEL[selNode.kind]}</p>
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
          <Button size="sm" variant="ghost" onclick={() => (selected = -1)}>Close</Button>
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  .page { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: var(--space-sm); }
  .top { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-md); flex-wrap: wrap; }
  .eyebrow { color: var(--muted-foreground); font-size: 0.8rem; margin: 0; }
  h1 { margin: 0; }
  .trail { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
  .trail button { color: var(--muted-foreground); text-decoration: underline; text-underline-offset: 2px; }
  .trail button.more { text-decoration: none; }
  .trail button, .trail strong { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trail span { color: var(--muted-foreground); }
  .search { min-width: min(20rem, 100%); }
  .controls { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: center; font-size: 0.9rem; }
  .controls label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .axis { width: 12rem; }
  .muted { color: var(--muted-foreground); font-size: 0.85rem; }
  .body { flex: 1 1 auto; min-height: 0; display: flex; gap: var(--space-md); }
  .canvas { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; }
  .side { flex: 0 0 18rem; display: flex; flex-direction: column; gap: 0.5rem; padding: var(--space-md); border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); overflow-y: auto; }
  .side h2 { margin: 0; font-size: 1.05rem; }
  .side p { margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .state { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted-foreground); }
  .state.error { color: var(--destructive, var(--foreground)); }
  .empty { position: absolute; left: 50%; transform: translateX(-50%); margin: 0; color: var(--muted-foreground); font-size: 0.85rem; }
  .empty.above { top: 0.75rem; }
  .empty.below { bottom: 0.75rem; }
</style>
