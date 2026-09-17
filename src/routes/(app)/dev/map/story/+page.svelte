<script lang="ts">
  /**
   * `/dev/map/story` — the guided tour. The prose scrolls down the left; the map stays put
   * on the right and changes as each step reaches the middle of the viewport. Steps are
   * data (`$lib/map/story.ts`); this page only decides which one is active and hands its
   * resolved view to the same `EmbeddingMap` the explore page uses.
   *
   * The map is still live: hover for a tooltip, click to ring a game, drag to pan. Scrolling
   * to the next step replaces the selection with that step's own.
   *
   * All copy is PLACEHOLDER — Phil writes it.
   */
  import { onMount } from 'svelte';
  import { initCatalog, catalog } from '$lib/catalog/catalog.svelte';
  import { loadMap } from '$lib/map/load';
  import type { CoordinateSet } from '$lib/map/coordinates';
  import type { GameFacts } from '$lib/map/facts';
  import type { ViewState } from '$lib/map/view';
  import { STEPS, BASE_VIEW, resolveStep } from '$lib/map/story';
  import EmbeddingMap from '$lib/map/EmbeddingMap.svelte';

  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const loaded = await loadMap();
      coords = loaded.coords;
      facts = loaded.facts;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // --- which step is active ------------------------------------------------------------
  let active = $state(0);
  let stepEls: HTMLElement[] = [];

  onMount(() => {
    // A step becomes active when it crosses the middle band of the viewport. The band is
    // narrow so exactly one step is "in" at a time; the most recently entered one wins.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) active = Number((e.target as HTMLElement).dataset.step);
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    for (const el of stepEls) if (el) io.observe(el);
    return () => io.disconnect();
  });

  const step = $derived(STEPS[active]);
  const resolved = $derived(coords && facts ? resolveStep(step, coords, facts) : null);

  // The step's view is the starting point; clicks on the map layer a selection on top of it
  // until the next step takes over.
  let view = $state<ViewState>({ ...BASE_VIEW, selected: [] });
  $effect(() => {
    if (resolved) view = resolved.view;
  });

  // --- the vector figure ---------------------------------------------------------------
  /** Per-component |max| across the map, so the bars are on the same scale everywhere. */
  const scale = $derived.by(() => {
    if (!coords) return [];
    return coords.pcs.map((pc) => {
      let m = 0;
      for (let i = 0; i < pc.length; i++) { const a = Math.abs(pc[i]); if (a > m) m = a; }
      return m || 1;
    });
  });
  const vector = $derived.by(() => {
    if (!coords || step.vectorOf === undefined) return null;
    const i = coords.index.get(step.vectorOf);
    if (i === undefined) return null;
    return coords.pcs.map((pc, j) => ({ label: `PC${j + 1}`, value: pc[i], frac: pc[i] / scale[j] }));
  });

  /** Rows for the neighbour list beside a neighbourhood step. */
  const neighbourRows = $derived.by(() => {
    if (!coords || !facts || !resolved || step.neighboursOf === undefined) return [];
    const c = coords, f = facts;
    return resolved.view.selected
      .map((id) => c.index.get(id))
      .filter((i): i is number => i != null)
      .map((i) => ({ id: c.ids[i], name: f.name(c.ids[i]), year: f.year[i] || null, weight: f.weight[i] || null }));
  });
</script>

<svelte:head>
  <title>Embedding map — the tour (dev only)</title>
</svelte:head>

<div class="story">
  <div class="prose">
    <header class="intro">
      <p class="eyebrow">Dev only — every word is placeholder</p>
      <h1>How the map works</h1>
      <p class="lede">Scroll. The map on the right follows along.</p>
    </header>

    {#each STEPS as s, i (s.id)}
      <article class="step" class:active={i === active} data-step={i} bind:this={stepEls[i]}>
        <p class="count">{i + 1} / {STEPS.length}</p>
        <h2>{s.title}</h2>
        {#each s.body as para}<p>{para}</p>{/each}

        {#if i === active && vector}
          <figure class="vector" aria-label="Coordinate vector">
            {#each vector as v (v.label)}
              <div class="row">
                <span class="lbl">{v.label}</span>
                <span class="bar">
                  <i class:neg={v.frac < 0} style:width="{Math.abs(v.frac) * 50}%" style:left="{v.frac < 0 ? 50 - Math.abs(v.frac) * 50 : 50}%"></i>
                </span>
                <span class="val">{v.value.toFixed(2)}</span>
              </div>
            {/each}
            <figcaption>Six of the components the map is drawn from, scaled to the whole map’s range.</figcaption>
          </figure>
        {/if}

        {#if i === active && neighbourRows.length}
          <ol class="neighbours">
            {#each neighbourRows as r (r.id)}
              <li><a href="/games/{r.id}">{r.name}</a> <span>{r.year ?? ''}{r.weight ? ` · ${r.weight.toFixed(1)}` : ''}</span></li>
            {/each}
          </ol>
        {/if}

        {#if s.id === 'explore'}
          <p><a class="cta" href="/dev/map">Open the map →</a></p>
        {/if}
      </article>
    {/each}
  </div>

  <div class="figure">
    <div class="map">
      {#if loadError}
        <div class="state error">Couldn’t load the map: {loadError}</div>
      {:else if !coords || !facts || !resolved}
        <div class="state">Loading {catalog.status === 'ready' ? 'coordinates' : 'catalog'}…</div>
      {:else}
        <EmbeddingMap
          {coords}
          {facts}
          {view}
          anchors={resolved.anchors}
          focus={resolved.focus}
          onselectionchange={(ids) => (view = { ...view, selected: ids })}
        />
      {/if}
    </div>
    <p class="caption">
      {step.title}
      {#if coords}<span> · {view.projection === 'pca' ? `PC${view.x} × PC${view.y}` : 'UMAP'} · colour: {view.colour}</span>{/if}
    </p>
  </div>
</div>

<style>
  .story {
    display: grid;
    grid-template-columns: minmax(16rem, 24rem) minmax(0, 1fr);
    gap: var(--space-xl);
    align-items: start;
  }
  /*
   * The figure is pinned while the prose scrolls past — a scrollytelling figure is by
   * definition viewport-sized, which is the one place a viewport unit belongs. The
   * subtraction is the app bar plus the shell's padding.
   */
  .figure {
    position: sticky;
    top: 0;
    height: calc(100svh - 8rem);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    min-height: 20rem;
  }
  .map { flex: 1 1 auto; min-height: 0; }
  .caption { margin: 0; color: var(--muted-foreground); font-size: 0.8rem; }
  .caption span { opacity: 0.8; }

  .intro { padding-block: var(--space-lg) var(--space-xl); }
  .eyebrow { margin: 0 0 0.25rem; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted-foreground); }
  .lede { color: var(--muted-foreground); }

  /* Each step takes most of a screen so there's a clear moment where it is the one in view. */
  .step {
    min-height: 70svh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-block: var(--space-lg);
    opacity: 0.35;
    transition: opacity 0.3s ease;
  }
  .step.active { opacity: 1; }
  .step:last-child { min-height: 50svh; }
  .count { margin: 0; font-size: 0.75rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .step h2 { margin: 0.25rem 0 0.75rem; color: var(--foreground); }
  .step p { color: var(--muted-foreground); line-height: 1.55; margin: 0 0 0.75rem; }
  .cta { color: var(--primary); font-weight: 600; }

  .vector { margin: 0.5rem 0 0; font-size: 0.8rem; }
  .vector .row { display: grid; grid-template-columns: 2.5rem 1fr 3rem; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }
  .vector .lbl { color: var(--muted-foreground); }
  .vector .val { text-align: right; font-variant-numeric: tabular-nums; color: var(--foreground); }
  .vector .bar { position: relative; height: 0.7rem; background: var(--muted); border-radius: 2px; overflow: hidden; }
  .vector .bar::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--border); }
  .vector .bar i { position: absolute; top: 0; bottom: 0; background: var(--map-ramp-hi); border-radius: 2px; }
  .vector .bar i.neg { background: var(--map-ramp-lo); }
  .vector figcaption { color: var(--muted-foreground); margin-top: 0.4rem; }

  .neighbours { margin: 0.25rem 0 0; padding-left: 1.25rem; font-size: 0.85rem; columns: 2; column-gap: 1.5rem; }
  .neighbours li { break-inside: avoid; margin-bottom: 0.2rem; }
  .neighbours a { color: var(--foreground); }
  .neighbours span { color: var(--muted-foreground); font-size: 0.75rem; }

  .state {
    height: 100%; display: grid; place-items: center;
    color: var(--muted-foreground); border: 1px dashed var(--border); border-radius: var(--radius, 0.5rem);
  }
  .state.error { color: var(--destructive, #b00); }

  @container (max-width: 48rem) {
    .story { grid-template-columns: 1fr; gap: 0; }
    .figure { order: -1; height: 46svh; top: 0; background: var(--background); z-index: 1; padding-bottom: var(--space-sm); }
    .step { min-height: 40svh; }
    .neighbours { columns: 1; }
  }
</style>
