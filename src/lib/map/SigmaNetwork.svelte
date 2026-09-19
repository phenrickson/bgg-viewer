<script lang="ts">
  /**
   * The ego network in Sigma.js, as plainly as Sigma does it — the comparison to
   * `NetworkLayer` on the shared `PointCanvas`. Same graph (`buildEgoNetwork`), then:
   * a graphology graph with x/y, size, color and label per node and nothing but endpoints
   * per edge; `new Sigma(graph, container)` with default settings; ForceAtlas2 (Sigma's
   * standard layout, in a web worker) running live; and the documented node-drag pattern.
   * No custom encodings, reducers or programs, so what you see is Sigma's own rendering,
   * labels, hover and camera.
   *
   * Dev-only comparison; all copy PLACEHOLDER.
   */
  import { onMount } from 'svelte';
  import Graph from 'graphology';
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { NetworkLayout } from './network';
  import { readTheme, type MapTheme } from './palette';

  let {
    coords,
    facts,
    layout,
    onpick
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: NetworkLayout;
    onpick?: (id: number) => void;
  } = $props();

  let host: HTMLDivElement;
  let theme = $state<MapTheme | null>(null);
  let sigma = $state.raw<import('sigma').default | null>(null);

  const SIZE: Record<0 | 1 | 2, number> = { 0: 12, 1: 8, 2: 5 };

  /** Nodes keyed by map index; seeded from the static layout so FA2 starts near rest. */
  const graph = $derived.by(() => {
    const g = new Graph({ type: 'undirected', multi: false });
    const t = theme;
    if (!t) return g;
    layout.graph.nodes.forEach((n, j) => {
      g.addNode(String(n.i), {
        x: layout.px[j], y: layout.py[j],
        size: SIZE[n.hop],
        label: facts.name(coords.ids[n.i]),
        color: facts.category[n.i] === 0 ? t.other : t.chart[facts.category[n.i] - 1]
      });
    });
    // All edges: mutual-only leaves the graph in pieces, which ForceAtlas2 flings apart.
    for (const e of layout.graph.edges) g.addEdge(String(e.a), String(e.b));
    return g;
  });

  onMount(() => {
    theme = readTheme();
    let disposed = false;
    import('sigma').then(({ default: Sigma }) => {
      if (disposed) return;
      sigma = new Sigma(graph, host);
    });
    return () => { disposed = true; sigma?.kill(); sigma = null; };
  });

  // A new graph (recentre) replaces the instance's graph.
  $effect(() => {
    const g = graph;
    if (!sigma) return;
    sigma.setGraph(g);
    sigma.getCamera().animatedReset({ duration: 400 });
  });

  // ForceAtlas2 in a worker (graphology-layout-forceatlas2) — Sigma's standard layout.
  // It has no notion of rest, so it runs for a few seconds after each graph change and
  // while a node is being dragged, then stops. And the drag pattern from Sigma's docs:
  // `downNode` fixes the node and disables the camera, `mousemovebody` moves it, `mouseup`
  // releases.
  const SETTLE_MS = 4000;
  $effect(() => {
    const g = graph, s = sigma;
    if (!s || g.order === 0) return;
    let fa2: { start: () => void; stop: () => void; kill: () => void } | null = null;
    let disposed = false;
    let settle = 0;
    const run = () => {
      if (!fa2) return;
      fa2.start();
      clearTimeout(settle);
      settle = window.setTimeout(() => fa2?.stop(), SETTLE_MS);
    };
    Promise.all([import('graphology-layout-forceatlas2/worker'), import('graphology-layout-forceatlas2')]).then(([{ default: FA2Layout }, { default: forceAtlas2 }]) => {
      if (disposed) return;
      fa2 = new FA2Layout(g, { settings: forceAtlas2.inferSettings(g) });
      run();
    });

    let dragged: string | null = null;
    let moved = false;
    const onDown = ({ node }: { node: string }) => {
      dragged = node; moved = false;
      g.setNodeAttribute(node, 'fixed', true);
      s.getCamera().disable();
      clearTimeout(settle); fa2?.start();
    };
    const onMove = (e: { x: number; y: number; original: Event; preventSigmaDefault: () => void }) => {
      if (!dragged) return;
      const p = s.viewportToGraph({ x: e.x, y: e.y });
      g.mergeNodeAttributes(dragged, { x: p.x, y: p.y });
      moved = true;
      e.preventSigmaDefault();
      e.original.preventDefault();
    };
    const onUp = () => {
      if (!dragged) return;
      g.removeNodeAttribute(dragged, 'fixed');
      dragged = null;
      s.getCamera().enable();
      run();
    };
    const onClick = ({ node }: { node: string }) => { if (!moved) onpick?.(coords.ids[Number(node)]); };
    s.on('downNode', onDown);
    s.on('clickNode', onClick);
    s.getMouseCaptor().on('mousemovebody', onMove);
    s.getMouseCaptor().on('mouseup', onUp);
    return () => {
      disposed = true; clearTimeout(settle); fa2?.kill();
      s.off('downNode', onDown);
      s.off('clickNode', onClick);
      s.getMouseCaptor().off('mousemovebody', onMove);
      s.getMouseCaptor().off('mouseup', onUp);
    };
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { position: absolute; inset: 0; background: var(--background); }
</style>
