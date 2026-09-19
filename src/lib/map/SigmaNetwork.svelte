<script lang="ts">
  /**
   * The ego network drawn by Sigma.js — the comparison to `NetworkLayer` on the shared
   * `PointCanvas`. Same graph (`buildEgoNetwork`) and same positions (`layoutEgoNetwork`),
   * so what differs is purely the renderer: Sigma has a real edge shader (anti-aliased,
   * curved via @sigma/edge-curve), its own label collision handling, hover reducers, and
   * its own camera — which is also the cost: it can't share regl-scatterplot's points, so
   * there is no flight from the map into this view.
   *
   * `live`: the force simulation keeps running (same model as the static layout, picked up
   * from where it stopped) so nodes can be dragged and the rest re-settle around them.
   * Sigma has no drag switch; this is its documented pattern — `downNode` pins the node,
   * `mousemovebody` moves it, `mouseup` releases, and the camera is disabled meanwhile so
   * the canvas doesn't pan underneath.
   *
   * Dev-only comparison; all copy PLACEHOLDER.
   */
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import Graph from 'graphology';
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import { egoSimulation, type NetworkLayout, type SimNode } from './network';
  import { readTheme, toHex, type MapTheme } from './palette';

  let {
    coords,
    facts,
    layout,
    oneWay = false,
    curvature = 0.18,
    minSim = 0,
    live = true,
    onpick
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: NetworkLayout;
    oneWay?: boolean;
    curvature?: number;
    minSim?: number;
    /** Keep the simulation running; nodes are draggable. Off, the static layout. */
    live?: boolean;
    onpick?: (id: number) => void;
  } = $props();

  let host: HTMLDivElement;
  let theme = $state<MapTheme | null>(null);
  // Reactive so the effects below run once the instance exists (it's created async).
  let sigma = $state.raw<import('sigma').default | null>(null);
  /** A drag that moved the node must not also count as a click (recentre). */
  let moved = false;
  let hovered = $state<string | null>(null);

  const SIZE: Record<0 | 1 | 2 | 3, number> = { 0: 9, 1: 6, 2: 3.5, 3: 2.5 };
  const colourOf = (t: MapTheme, i: number) => (facts.category[i] === 0 ? t.other : t.chart[facts.category[i] - 1]);

  /** The graphology graph for the current layout — nodes keyed by map index. */
  const graph = $derived.by(() => {
    const t = theme;
    const g = new Graph({ type: 'undirected', multi: false });
    if (!t) return g;
    layout.graph.nodes.forEach((n, j) => {
      g.addNode(String(n.i), {
        // Simulation units, not NDC: Sigma fits its camera to the graph's bounds anyway,
        // and a live simulation then continues in the same units it stopped in.
        x: layout.px[j], y: layout.py[j],
        size: SIZE[n.hop], hop: n.hop, sim: n.sim,
        label: facts.name(coords.ids[n.i]),
        // Sigma parses hex/rgb only; the theme's oklch tokens would come out black.
        color: toHex(colourOf(t, n.i))
      });
    });
    const sims = layout.graph.edges.map((e) => e.sim);
    const lo = Math.min(...sims), hi = Math.max(...sims);
    for (const e of layout.graph.edges) {
      if (!(oneWay || e.mutual) || e.sim < minSim) continue;
      const u = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
      const outer = (g.getNodeAttribute(String(e.a), 'hop') >= 2) && (g.getNodeAttribute(String(e.b), 'hop') >= 2);
      g.addEdge(String(e.a), String(e.b), {
        type: 'curved',
        curvature,
        size: 0.6 + u * 1.6,
        sim: e.sim, mutual: e.mutual,
        // Alpha as on the regl layer: similarity ramp, mutual over one-way, knots lighter.
        alpha: (e.mutual ? 0.15 + Math.max(0, e.sim - 0.5) * 0.9 : Math.min(0.45, (0.15 + Math.max(0, e.sim - 0.5) * 0.9) * 0.6 + 0.12)) * (outer ? 0.55 : 1)
      });
    }
    return g;
  });

  const rgba = (css: string, a: number) => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.fillStyle = css; c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0]},${d[1]},${d[2]},${a.toFixed(3)})`;
  };

  onMount(() => {
    theme = readTheme();
    // Watch for the theme class from the start: mode-watcher applies it after mount, and
    // an observer installed only once Sigma has loaded misses that flip.
    const mo = new MutationObserver(() => { theme = readTheme(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    let disposed = false;
    Promise.all([import('sigma'), import('sigma/rendering'), import('@sigma/edge-curve')]).then(([{ default: Sigma }, { drawDiscNodeLabel }, { default: EdgeCurveProgram }]) => {
      if (disposed) return;
      theme = readTheme();
      // Read at draw time, not captured: mode-watcher applies the dark class after mount,
      // and the theme can flip while the instance lives.
      const t = () => theme!;
      // Sigma's hover card is hard-coded white (#FFF); on the dark theme that's white text
      // on a white pill. Same shape, in the theme's own surfaces.
      const drawHover: import('sigma/rendering').NodeHoverDrawingFunction = (ctx, data, settings) => {
        const size = settings.labelSize, font = settings.labelFont, weight = settings.labelWeight;
        ctx.font = `${weight} ${size}px ${font}`;
        ctx.fillStyle = t().background;
        ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.5)';
        const PAD = 3;
        if (data.label) {
          const w = ctx.measureText(data.label).width, h = size, r = data.size + PAD;
          const x = Math.round(data.x), y = Math.round(data.y), bw = Math.round(w + 6 + r + PAD), bh = h + 2 * PAD;
          ctx.beginPath();
          ctx.moveTo(x, y + bh / 2); ctx.lineTo(x + r + bw, y + bh / 2); ctx.lineTo(x + r + bw, y - bh / 2); ctx.lineTo(x, y - bh / 2);
          ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, true);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(data.x, data.y, data.size + PAD, 0, Math.PI * 2); ctx.closePath(); ctx.fill();
        }
        ctx.shadowBlur = 0;
        drawDiscNodeLabel(ctx, data, settings);
      };
      sigma = new Sigma(graph, host, {
        edgeProgramClasses: { curved: EdgeCurveProgram },
        renderEdgeLabels: false,
        labelFont: t().font,
        labelSize: 12,
        labelWeight: '600',
        labelColor: { color: toHex(t().foreground) },
        defaultDrawNodeHover: drawHover,
        // Sigma's label grid: labels for the biggest nodes per cell, never overlapping.
        labelDensity: 1.2,
        labelGridCellSize: 90,
        labelRenderedSizeThreshold: 5,
        defaultEdgeType: 'curved',
        zIndex: true,
        // Sigma's contexts are created without MSAA; edges are anti-aliased by a shader
        // feather whose default (1px) is too little for thin, faint lines. Wider feather,
        // and a floor on thickness so no edge rasterises sub-pixel.
        antiAliasingFeather: 2.5,
        minEdgeThickness: 2.2,
        // Hover: the node and its neighbours stay full strength and all get labels; the
        // rest of the graph steps back. Lit edges take the foreground ink at full alpha
        // (the accent is too dark against the dark theme).
        nodeReducer: (node, data) => {
          const neighbour = hovered != null && hovered !== node && graph.areNeighbors(hovered, node);
          const lit = hovered === node || neighbour;
          return {
            ...data,
            highlighted: hovered === node,
            color: hovered != null && !lit ? rgba(data.color, 0.45) : data.color,
            size: neighbour ? data.size * 1.25 : data.size,
            zIndex: lit ? 4 : 3 - Math.min(data.hop, 2),
            forceLabel: neighbour || (hovered == null && data.hop <= 1),
            label: hovered != null && !lit ? '' : data.label
          };
        },
        edgeReducer: (edge, data) => {
          const lit = hovered != null && graph.hasExtremity(edge, hovered);
          return {
            ...data,
            color: lit ? toHex(t().foreground) : rgba(t().foreground, hovered != null ? data.alpha * 0.3 : data.alpha),
            size: lit ? Math.max(data.size * 1.4, 1.6) : data.size,
            zIndex: lit ? 2 : 0
          };
        }
      });
      sigma.on('enterNode', ({ node }) => { hovered = node; });
      sigma.on('leaveNode', () => { hovered = null; });
      sigma.on('clickNode', ({ node }) => { if (!moved) onpick?.(coords.ids[Number(node)]); });
      if (dev) (window as unknown as { __sigma: unknown }).__sigma = sigma;
    });
    // Theme flips (or arrives late): Sigma's own label settings follow, and it repaints.
    $effect(() => {
      const t = theme, s = sigma;
      if (!t || !s) return;
      s.setSetting('labelColor', { color: toHex(t.foreground) });
      s.setSetting('labelFont', t.font);
      s.refresh();
    });
    return () => { disposed = true; mo.disconnect(); sigma?.kill(); sigma = null; };
  });

  // A new graph (recentre, filter, curvature) swaps the instance's graph in place.
  $effect(() => {
    const g = graph;
    if (!sigma) return;
    sigma.setGraph(g);
    sigma.getCamera().animatedReset({ duration: 400 });
  });
  $effect(() => { void hovered; sigma?.refresh({ skipIndexation: true }); });

  // --- live simulation ---------------------------------------------------------------
  // One simulation per layout, seeded from the static result so it starts settled and
  // only moves when disturbed (a drag, or a recentre). Positions stream into graphology on
  // each tick; Sigma redraws on graph changes.
  $effect(() => {
    const g = graph, s = sigma;
    if (!live || !s || g.order === 0) return;
    const { sim, nodes } = egoSimulation(layout.graph, (i) => (i === layout.graph.source ? 8 : 5));
    nodes.forEach((n, j) => { n.x = layout.px[j]; n.y = layout.py[j]; });
    const byKey = new Map(nodes.map((n) => [String(n.i), n]));
    sim.alpha(0.15).alphaDecay(0.02).velocityDecay(0.35);
    sim.on('tick', () => {
      for (const n of nodes) if (g.hasNode(String(n.i))) g.mergeNodeAttributes(String(n.i), { x: n.x, y: n.y });
    });
    sim.restart();

    // Drag: pin under the pointer while held; the rest of the graph re-settles around it.
    let dragging: SimNode | null = null;
    const onDown = ({ node }: { node: string }) => {
      const n = byKey.get(node);
      if (!n) return;
      dragging = n; moved = false;
      n.fx = n.x; n.fy = n.y;
      s.getCamera().disable();
      sim.alphaTarget(0.3).restart();
    };
    const onMove = (e: { x: number; y: number; original: Event; preventSigmaDefault: () => void }) => {
      if (!dragging) return;
      const p = s.viewportToGraph({ x: e.x, y: e.y });
      if (p.x !== dragging.fx || p.y !== dragging.fy) moved = true;
      dragging.fx = p.x; dragging.fy = p.y;
      e.preventSigmaDefault();
      e.original.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      // The centre stays pinned at the origin; anything else is let go.
      if (dragging.i !== layout.graph.source) { dragging.fx = null; dragging.fy = null; }
      dragging = null;
      s.getCamera().enable();
      sim.alphaTarget(0);
    };
    s.on('downNode', onDown);
    s.getMouseCaptor().on('mousemovebody', onMove);
    s.getMouseCaptor().on('mouseup', onUp);
    return () => {
      sim.stop();
      s.off('downNode', onDown);
      s.getMouseCaptor().off('mousemovebody', onMove);
      s.getMouseCaptor().off('mouseup', onUp);
    };
  });
</script>

<div class="host" bind:this={host}></div>

<style>
  .host { position: absolute; inset: 0; background: var(--background); }
</style>
