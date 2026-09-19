<script lang="ts">
  /**
   * One game's ego network as a layer on a `PointCanvas`. Its own encodings, not the
   * map's: node colour is the category (the legend's colours mean what they say), size and
   * ring follow the hop (centre, neighbour, neighbour's neighbour), edges are drawn under
   * the nodes with mutual links (each lists the other) solid and one-way links faint or
   * off, and labels go to the centre and its neighbours, with the rest on hover. Positions
   * come from `layoutEgoNetwork`; mounted inside the same canvas as a `MapLayer`, the
   * points travel from their map spots into the layout and back.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { NetworkLayout } from './network';
  import { useSurface, type Driver, type Line } from './surface';
  import { toRgb } from './palette';
  import { ring, glow, labels } from './ink';
  import type { LabelInput } from './labels';

  let {
    coords,
    facts,
    layout,
    oneWay = false,
    curvature = 0.18,
    minSim = 0,
    onpick,
    onhover
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: NetworkLayout;
    /** Also draw the one-way edges (faint, dashed). Off by default: the mutual ones carry the structure. */
    oneWay?: boolean;
    /**
     * How much an edge bows, as a fraction of its chord at full length; 0 = straight. Short
     * edges bow less than this (a knot of close neighbours stays a knot, not a swirl), long
     * spokes bow the full amount.
     */
    curvature?: number;
    /** Draw only edges at or above this cosine similarity (the graph itself is unchanged). */
    minSim?: number;
    /** A node was clicked — usually to make it the new centre. */
    onpick?: (id: number) => void;
    onhover?: (id: number | null) => void;
  } = $props();

  const surface = useSurface();
  if (!surface) throw new Error('NetworkLayer must be mounted inside a PointCanvas');

  const DIAMETER: Record<0 | 1 | 2, number> = { 0: 16, 1: 11, 2: 7 };
  const n = $derived(coords.ids.length);
  const hopOf = $derived(new Map(layout.graph.nodes.map((x) => [x.i, x.hop])));
  const simOf = $derived(new Map(layout.graph.nodes.map((x) => [x.i, x.sim])));

  /** Nodes take the layout's spot; everything else stays where the previous layer left
   * it and is filtered out, so only the nodes travel. */
  const pos = $derived.by(() => {
    const x = new Float32Array(n), y = new Float32Array(n);
    layout.graph.nodes.forEach((node, j) => { x[node.i] = layout.x[j]; y[node.i] = layout.y[j]; });
    return { x, y };
  });
  /** Category colour: bucket 0 is "other", 1.. the top categories — the map's palette order. */
  const palette = $derived.by(() => {
    const t = surface.theme;
    return t ? [t.other, ...t.chart] : [];
  });
  const size = $derived.by(() => {
    const s = new Uint8Array(n);
    for (const [i, hop] of hopOf) s[i] = DIAMETER[hop];
    return s;
  });
  const visible = $derived(layout.graph.nodes.map((x) => x.i));
  /** Hop-2 nodes worth naming: the hubs of the outer knots, by degree within the graph. */
  const HUB_LABELS = 6;
  const hubs = $derived.by(() => {
    const deg = new Map<number, number>();
    for (const e of layout.graph.edges) { if (e.mutual) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); } }
    return new Set(
      layout.graph.nodes.filter((n) => n.hop === 2).sort((p, q) => (deg.get(q.i) ?? 0) - (deg.get(p.i) ?? 0)).slice(0, HUB_LABELS).map((n) => n.i)
    );
  });
  const edges = $derived(layout.graph.edges.filter((e) => (oneWay || e.mutual) && e.sim >= minSim));

  /**
   * Edges as regl line geometry in data space (see `Driver.lines`). Each edge is a
   * quadratic curve bowed to one consistent side of its chord — a criss-cross of chords
   * reads as a wiring diagram; curves read as flow, and shallow-angle stair-stepping goes
   * with them. regl's line shader has no edge feathering (it relies on MSAA, which many
   * GPUs decline), so each curve is drawn as three stacked passes — wide and faint, medium,
   * thin core — whose edge falls off over ~2px the way an anti-aliased stroke would.
   * Ink follows similarity, mutual heavier than one-way; the hovered node's edges light up
   * in the accent. Rebuilt on hover — a few hundred curves, cheap — not per camera frame.
   */
  const hoveredNode = $derived(surface.hovered);
  const CURVE_SEGMENTS = 14;
  /** Chord length (NDC) at which an edge bows the full `curvature`; shorter bow in proportion. */
  const FULL_BOW_LENGTH = 0.5;
  function curve(a: number, b: number): [number, number][] {
    const x1 = pos.x[a], y1 = pos.y[a], x2 = pos.x[b], y2 = pos.y[b];
    const dx = x2 - x1, dy = y2 - y1;
    const bow = curvature * Math.min(1, Math.hypot(dx, dy) / FULL_BOW_LENGTH);
    if (bow < 0.005) return [[x1, y1], [x2, y2]];
    // Control point off the chord's midpoint, on the chord's left going from the lower
    // index to the higher, so an edge bows the same way whichever end it was found from.
    const s = a < b ? 1 : -1;
    const cx = (x1 + x2) / 2 - dy * bow * s, cy = (y1 + y2) / 2 + dx * bow * s;
    const pts: [number, number][] = [];
    for (let k = 0; k <= CURVE_SEGMENTS; k++) {
      const t = k / CURVE_SEGMENTS, u = 1 - t;
      pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
    }
    return pts;
  }
  const lines = $derived.by<Line[]>(() => {
    const t = surface.theme;
    if (!t) return [];
    const ink = toRgb(t.foreground).map((c) => c / 255) as [number, number, number];
    const accent = toRgb(t.accent).map((c) => c / 255) as [number, number, number];
    // Outer → inner: (width multiplier, alpha multiplier). The core carries the ink; the
    // passes above it step the alpha down in small increments so no single pass has a
    // visible edge of its own (two or three wide passes read as parallel strands).
    const PASSES: [number, number][] = [[2.6, 0.05], [2.2, 0.08], [1.8, 0.13], [1.4, 0.28], [1, 1]];
    const layers: Line[][] = PASSES.map(() => []);
    let simLo = Infinity, simHi = -Infinity;
    for (const e of edges) { if (e.sim < simLo) simLo = e.sim; if (e.sim > simHi) simHi = e.sim; }
    for (const e of edges) {
      const lit = e.a === hoveredNode || e.b === hoveredNode;
      const ramp = 0.15 + Math.max(0, e.sim - 0.5) * 0.9;
      // Edges between two outer nodes are the knots' own wiring; they're kept lighter than
      // the spokes into the centre so a dense family stays a texture, not a wash.
      const outer = (hopOf.get(e.a) ?? 2) === 2 && (hopOf.get(e.b) ?? 2) === 2;
      const alpha = (lit ? 1 : e.mutual ? ramp : Math.min(0.45, ramp * 0.6 + 0.12)) * (outer && !lit ? 0.55 : 1);
      const rgb = lit ? accent : ink;
      // Width follows similarity too: the strongest links are the heaviest strokes. The
      // ramp spans the range the graph actually has, so it's read relative to this graph.
      const t = simHi > simLo ? (e.sim - simLo) / (simHi - simLo) : 1;
      // Floor at 1.2px: below that the core rasterises as broken sub-pixel runs.
      const base = Math.max(1.2, (1.2 + t * 1.2) * (lit ? 1.4 : e.mutual ? 1 : 0.85));
      const points = curve(e.a, e.b);
      PASSES.forEach(([w, a], k) => layers[k].push({ points, color: [...rgb, alpha * a], width: base * w }));
    }
    // Every outer pass under every inner one, so cores are never buried by a neighbour's feather.
    return layers.flat();
  });

  let tip = $state<{ x: number; y: number } | null>(null);
  const driver: Driver = {
    get x() { return pos.x; },
    get y() { return pos.y; },
    get colour() { return facts.category; },
    get palette() { return palette; },
    get size() { return size; },
    get visible() { return visible; },
    // Frame the graph after every change of centre: the layout is refitted to the data
    // square, so the camera has to follow it or a zoomed-in view is left looking at
    // nothing.
    get focus() { return visible; },
    get lines() { return lines; },
    opacity: 0.9,
    onhover: (i) => onhover?.(i >= 0 ? coords.ids[i] : null),
    onselect: (points) => { if (points.length === 1) onpick?.(coords.ids[points[0]]); },
    overlay: (ctx, api) => {
      const { theme, hovered, screen } = api;
      // Nothing mid-flight: `screen()` already reports where a point is going, so markers
      // would run ahead of the dots. The nodes arrive, then the structure appears. And
      // nothing while panning: the 2-D canvas can't keep step with the GL one under a
      // drag, so rings and labels lift off and land again on release.
      if (!api.drawn || api.dragging) { tip = null; return; }
      const at = new Map<number, [number, number]>();
      for (const node of layout.graph.nodes) {
        const p = screen(node.i);
        if (p) at.set(node.i, p);
      }
      // A soft halo in each node's own colour, wider and brighter the nearer the centre,
      // gives the dots depth against the edges. Then rings for the centre and its
      // neighbours; labels for those, plus the hovered node — plain haloed text, no chips
      // (chips are for legibility over 30k dots; here they'd box every name).
      const colourOf = (i: number) => palette[facts.category[i]] ?? theme.foreground;
      for (const node of layout.graph.nodes) {
        const p = at.get(node.i);
        if (!p) continue;
        const r = DIAMETER[node.hop] / 2;
        glow(ctx, p[0], p[1], r * (node.hop === 0 ? 3.2 : 2.4), colourOf(node.i), node.hop === 0 ? 0.35 : node.hop === 1 ? 0.22 : 0.12);
      }
      const want: LabelInput[] = [];
      for (const node of layout.graph.nodes) {
        const p = at.get(node.i);
        if (!p) continue;
        const r = DIAMETER[node.hop] / 2;
        if (node.hop === 0) ring(ctx, p[0], p[1], r + 2, theme.foreground, theme.background, 2.5);
        else if (node.hop === 1) ring(ctx, p[0], p[1], r + 1.5, theme.foreground, theme.background, 1.2);
        if (node.hop <= 1 || hubs.has(node.i) || node.i === hovered) want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[node.i]), gap: r + 4 });
      }
      // Priority order: the hovered node, then centre, neighbours, hubs (the node order); a
      // label that can't be placed clear of a higher one is dropped rather than stacked.
      const hp = hovered >= 0 ? at.get(hovered) : undefined;
      if (hp) want.sort((l, r) => (l.x === hp[0] && l.y === hp[1] ? -1 : 0) - (r.x === hp[0] && r.y === hp[1] ? -1 : 0));
      labels(ctx, want, api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true });
      if (hovered >= 0 && hopOf.has(hovered)) {
        const p = at.get(hovered);
        if (p) ring(ctx, p[0], p[1], DIAMETER[hopOf.get(hovered)!] / 2 + 3, theme.accent, theme.background, 2);
        tip = p ? { x: p[0], y: p[1] } : null;
      } else tip = null;
    }
  };
  $effect(() => {
    surface.drive(driver);
    return () => surface.release(driver);
  });
  $effect(() => { void lines; surface.repaint(); });

  const hovered = $derived(surface.hovered);
  const mutualCount = $derived(edges.filter((e) => e.mutual).length);
</script>

<div class="legend">
  <div class="legend-title">Category</div>
  {#each facts.categoryLabels as label, c (c)}
    <div class="swatch-row"><i style:background={c === 0 ? 'var(--map-cat-other)' : `var(--map-cat-${c})`}></i> {label}</div>
  {/each}
  <div class="legend-title rule">Edges</div>
  <div class="swatch-row"><b class="solid"></b> mutual ({mutualCount})</div>
  {#if oneWay}<div class="swatch-row"><b class="dashed"></b> one-way ({edges.length - mutualCount})</div>{/if}
  {#if minSim > 0}<div class="swatch-row">similarity ≥ {minSim.toFixed(2)}</div>{/if}
</div>
{#if tip && hovered >= 0 && hopOf.has(hovered)}
  {@const id = coords.ids[hovered]}
  <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px">
    <div class="name">{facts.name(id)}</div>
    <div class="meta">
      {#if hopOf.get(hovered) === 0}centre{:else}{(simOf.get(hovered) ?? 0).toFixed(2)} to centre · hop {hopOf.get(hovered)}{/if}
      · {facts.year[hovered] || '—'}
      · {facts.usersRated[hovered].toLocaleString()} ratings
    </div>
  </div>
{/if}

<style>
  .tip {
    position: absolute; pointer-events: none; max-width: 18rem; padding: 0.4rem 0.6rem;
    border: 1px solid var(--border); border-radius: 0.375rem; background: var(--card); color: var(--foreground);
    box-shadow: 0 2px 8px oklch(0 0 0 / 0.12); font-size: 0.8125rem; line-height: 1.3;
  }
  .tip .name { font-weight: 600; }
  .tip .meta { color: var(--muted-foreground); }
  .legend {
    position: absolute; right: 0.75rem; bottom: 0.75rem; padding: 0.45rem 0.6rem;
    border: 1px solid var(--border); border-radius: 0.375rem;
    background: color-mix(in oklch, var(--card) 88%, transparent);
    color: var(--muted-foreground); font-size: 0.75rem; line-height: 1.4; min-width: 9rem;
  }
  .legend-title { color: var(--foreground); font-weight: 600; margin-bottom: 0.25rem; }
  .legend-title.rule { margin-top: 0.4rem; }
  .swatch-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.15rem; }
  .swatch-row i { width: 0.65rem; height: 0.65rem; border-radius: 50%; flex: none; }
  .swatch-row b { width: 1rem; height: 0; flex: none; border-top: 1.5px solid var(--foreground); }
  .swatch-row b.dashed { border-top-style: dashed; opacity: 0.5; }
</style>
