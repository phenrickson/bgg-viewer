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
  import { ring, labels } from './ink';
  import type { LabelInput } from './labels';

  let {
    coords,
    facts,
    layout,
    oneWay = false,
    onpick,
    onhover
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: NetworkLayout;
    /** Also draw the one-way edges (faint, dashed). Off by default: the mutual ones carry the structure. */
    oneWay?: boolean;
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
  const edges = $derived(oneWay ? layout.graph.edges : layout.graph.edges.filter((e) => e.mutual));

  /**
   * Edges as regl line geometry in data space (see `Driver.lines`): ink follows similarity,
   * mutual heavier than one-way; the hovered node's edges light up in the accent. Rebuilt
   * on hover — a few hundred segments, cheap — rather than repainted every camera frame.
   */
  const hoveredNode = $derived(surface.hovered);
  const lines = $derived.by<Line[]>(() => {
    const t = surface.theme;
    if (!t) return [];
    const ink = toRgb(t.foreground).map((c) => c / 255) as [number, number, number];
    const accent = toRgb(t.accent).map((c) => c / 255) as [number, number, number];
    const out: Line[] = [];
    for (const e of edges) {
      const lit = e.a === hoveredNode || e.b === hoveredNode;
      const ramp = 0.15 + Math.max(0, e.sim - 0.5) * 0.9;
      const alpha = lit ? 1 : e.mutual ? ramp : Math.min(0.45, ramp * 0.6 + 0.12);
      out.push({ x1: pos.x[e.a], y1: pos.y[e.a], x2: pos.x[e.b], y2: pos.y[e.b], color: [...(lit ? accent : ink), alpha], width: lit ? 2 : e.mutual ? 1.4 : 1 });
    }
    return out;
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
      // would run ahead of the dots. The nodes arrive, then the structure appears.
      if (!api.drawn) { tip = null; return; }
      const at = new Map<number, [number, number]>();
      for (const node of layout.graph.nodes) {
        const p = screen(node.i);
        if (p) at.set(node.i, p);
      }
      // Rings say "how far from the centre": the centre thick in the foreground ink,
      // neighbours thin; the outer ring bare. Labels: centre + neighbours, plus hover.
      const want: LabelInput[] = [];
      for (const node of layout.graph.nodes) {
        const p = at.get(node.i);
        if (!p) continue;
        const r = DIAMETER[node.hop] / 2;
        if (node.hop === 0) ring(ctx, p[0], p[1], r + 2, theme.foreground, theme.background, 2.5);
        else if (node.hop === 1) ring(ctx, p[0], p[1], r + 1.5, theme.foreground, theme.background, 1.2);
        if (node.hop <= 1 || node.i === hovered) want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[node.i]), gap: r + 4 });
      }
      labels(ctx, want, api.width, api.height, theme.foreground, theme.background);
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
  const mutualCount = $derived(layout.graph.edges.filter((e) => e.mutual).length);
</script>

<div class="legend">
  <div class="legend-title">Category</div>
  {#each facts.categoryLabels as label, c (c)}
    <div class="swatch-row"><i style:background={c === 0 ? 'var(--map-cat-other)' : `var(--map-cat-${c})`}></i> {label}</div>
  {/each}
  <div class="legend-title rule">Edges</div>
  <div class="swatch-row"><b class="solid"></b> mutual ({mutualCount})</div>
  {#if oneWay}<div class="swatch-row"><b class="dashed"></b> one-way ({layout.graph.edges.length - mutualCount})</div>{/if}
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
