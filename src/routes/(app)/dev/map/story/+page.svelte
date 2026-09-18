<script lang="ts">
  /**
   * `/dev/map/story` — the guided tour, in the overlay layout scrollytelling pieces use:
   * the map fills the viewport and stays pinned; the prose scrolls over it as narrow
   * cards down the middle, and the map changes as each card reaches the trigger line.
   * Steps are data (`$lib/map/story.ts`); this page only decides which one is active and
   * hands its resolved view to the same `EmbeddingMap` the explore page uses.
   *
   * The map is a picture on most steps; a step opts into hover/click (`interactive`) where
   * poking at the neighbourhood is the point. Scrolling to the next step replaces the
   * selection with that step's own.
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
  import { fetchNeighbours, neighbourList, type NeighboursArtifact } from '$lib/map/neighbours';
  import EmbeddingMap from '$lib/map/EmbeddingMap.svelte';
  import { scrolly, type ScrollyOptions } from '$lib/scrolly';
  import { Container } from '$lib/components/ui/layout';

  let coords = $state<CoordinateSet | null>(null);
  let facts = $state<GameFacts | null>(null);
  let neighbours = $state<NeighboursArtifact | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    try {
      await initCatalog();
      if (catalog.status !== 'ready') throw new Error(catalog.error ?? 'catalog failed to load');
      const [loaded, nb] = await Promise.all([loadMap(), fetchNeighbours()]);
      coords = loaded.coords;
      facts = loaded.facts;
      neighbours = nb;
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // --- which step is active ------------------------------------------------------------
  // Scrollama drives this: a step is active from the moment it crosses the trigger line
  // (mid-viewport) until the next one does. `progress` is how far through the active step
  // the line is, for anything that wants to move continuously rather than snap.
  let active = $state(0);
  let progress = $state(0);
  let prose = $state<HTMLElement | null>(null);
  // The app shell scrolls `main`, not the window; Scrollama needs to measure against it.
  const scrollRoot = $derived(prose?.closest('main') ?? null);
  // The pinned figure is exactly one scroll-viewport tall. That's <main>'s box, not the
  // window's (the app bar sits above it), so measure it rather than guess at 100svh − bar.
  let viewportH = $state(0);
  $effect(() => {
    const root = scrollRoot;
    if (!root) return;
    const ro = new ResizeObserver(([e]) => { viewportH = e.contentRect.height; });
    ro.observe(root);
    return () => ro.disconnect();
  });
  const scrollyOptions = $derived<ScrollyOptions>({
    step: 'article.step', // not the intro header, which shares the layout class
    offset: 0.5,
    progress: true,
    root: scrollRoot,
    onEnter: (i) => { active = i; },
    onProgress: (i, p) => { if (i === active) progress = p; }
  });

  const step = $derived(STEPS[active]);
  const resolved = $derived(coords && neighbours ? resolveStep(step, coords, neighbours) : null);

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
    if (!coords || !facts || !neighbours || step.neighboursOf === undefined) return [];
    const c = coords, f = facts;
    return neighbourList(neighbours, step.neighboursOf, step.n ?? 10, step.upcomingOnly)
      .map(({ id, sim }) => ({ id, sim, i: c.index.get(id) }))
      .filter((r): r is { id: number; sim: number; i: number } => r.i != null)
      .map(({ id, sim, i }) => ({ id, sim, name: f.name(id), year: f.year[i] || null }));
  });
</script>

<svelte:head>
  <title>Embedding map — the tour (dev only)</title>
</svelte:head>

<Container size="content">
<div class="story" bind:this={prose} use:scrolly={scrollyOptions} style:--vh="{viewportH}px">
  <!-- Pinned. Everything after it scrolls over the top. -->
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
          cameraFixed
          frame={false}
          interactive={step.interactive ?? false}
          onselectionchange={(ids) => (view = { ...view, selected: ids })}
        />
        {#if step.strip}
          <div class="strip-caption" aria-hidden="true">
            <span class="pole">← {step.strip.poles[0]}</span>
            <span class="strip-title">{step.strip.title}</span>
            <span class="pole">{step.strip.poles[1]} →</span>
          </div>
        {/if}
      {/if}
    </div>
    <div class="hud">
      <div class="progress" aria-hidden="true">
        {#each STEPS as s, i (s.id)}
          <i style:--p={i === active ? progress : i < active ? 1 : 0}></i>
        {/each}
      </div>
      <p class="caption">
        {#if view.projection === 'strip'}PC{view.x} as a strip · dots jittered vertically · {resolved?.anchors.length ?? 0} games labelled{:else if coords}{view.projection === 'pca' ? `PC${view.x} × PC${view.y}` : 'UMAP'} · colour: {view.colour}{#if step.neighboursOf !== undefined} · neighbours by cosine on the full embedding{/if}{/if}
      </p>
    </div>
  </div>

  <div class="steps">
    <header class="step intro">
      <p class="eyebrow">Dev only — every word is placeholder</p>
      <h1>How the map works</h1>
      <p class="lede">Scroll.</p>
    </header>

    {#each STEPS as s, i (s.id)}
      <article class="step" class:active={i === active} class:low={!!s.strip}>
        <div class="card">
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
                <li><a href="/games/{r.id}">{r.name}</a> <span>{r.year ?? ''} · {r.sim.toFixed(2)}</span></li>
              {/each}
            </ol>
          {/if}

          {#if s.id === 'explore'}
            <p><a class="cta" href="/dev/map">Open the map →</a></p>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</div>
</Container>

<style>
  /*
   * Inside the site's content measure like every other page. The figure is sticky within
   * <main>'s padding and fills its visible box (`--vh`, measured above) less that padding.
   * The steps come after it in flow, pulled up over it with a negative margin so they
   * scroll across the map.
   */
  .story {
    position: relative;
    --fig: calc(var(--vh) - 2 * var(--space-lg));
  }
  .figure {
    position: sticky;
    top: var(--space-lg);
    height: var(--fig);
    display: flex;
    flex-direction: column;
    z-index: 0;
  }
  .map { flex: 1 1 auto; min-height: 0; position: relative; }
  .strip-caption {
    position: absolute; top: 0.75rem; left: 0; right: 0;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline; gap: 1rem;
    padding: 0 1.25rem; pointer-events: none; font-size: 0.8rem; color: var(--muted-foreground);
  }
  .strip-title { color: var(--foreground); font-weight: 650; font-size: 0.95rem; white-space: nowrap; }
  .strip-caption .pole:last-child { text-align: right; }

  .hud {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 0.5rem var(--space-md) 0.6rem;
    border-radius: 0 0 var(--radius, 0.5rem) var(--radius, 0.5rem);
    display: flex; flex-direction: column; gap: 0.4rem;
    pointer-events: none;
    background: linear-gradient(to top, color-mix(in oklch, var(--background) 85%, transparent), transparent);
  }
  /* One segment per step; the active one fills with Scrollama's progress. */
  .progress { display: flex; gap: 0.25rem; height: 3px; max-width: 24rem; }
  .progress i { flex: 1; background: var(--muted); border-radius: 2px; overflow: hidden; position: relative; }
  .progress i::after {
    content: ''; position: absolute; inset: 0; background: var(--primary);
    transform-origin: left; transform: scaleX(var(--p, 0));
  }
  .caption { margin: 0; color: var(--muted-foreground); font-size: 0.75rem; }

  .steps {
    position: relative;
    z-index: 1;
    margin-top: calc(-1 * var(--fig));
    padding-bottom: calc(0.3 * var(--fig));
    /* The column itself must not swallow drags on the map between cards. */
    pointer-events: none;
  }
  /* Each step is a viewport tall so there's a clear moment where its card is the one in
   * the middle; the card is the only thing that takes the pointer. */
  .step {
    min-height: var(--fig);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-lg);
  }
  .step.intro { flex-direction: column; text-align: center; }
  /* Strip steps: the strip's band sits in the upper part of the figure, so the card drops
   * below it instead of covering it. */
  .step.low { align-items: flex-end; padding-bottom: 2.5rem; }
  /* Percentages don't resolve against a min-height flex parent; size against the figure. */
  .step.low .card { width: min(100%, 56rem); max-height: calc(0.34 * var(--fig)); overflow: auto; }
  .intro > * { pointer-events: auto; }
  .card {
    pointer-events: auto;
    width: min(100%, 38rem);
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.5rem);
    background: color-mix(in oklch, var(--card) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 8px 24px oklch(0 0 0 / 0.12);
    opacity: 0.55;
    transition: opacity 0.3s ease;
  }
  .step.active .card { opacity: 1; }
  .eyebrow { margin: 0 0 0.25rem; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted-foreground); }
  .lede { color: var(--muted-foreground); }
  .count { margin: 0; font-size: 0.75rem; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .card h2 { margin: 0.25rem 0 0.75rem; color: var(--foreground); }
  .card p { color: var(--muted-foreground); line-height: 1.55; margin: 0 0 0.75rem; }
  .card p:last-child { margin-bottom: 0; }
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
    color: var(--muted-foreground);
  }
  .state.error { color: var(--destructive, #b00); }

  @container (max-width: 40rem) {
    .neighbours { columns: 1; }
    .card { padding: 1rem; }
  }
</style>
