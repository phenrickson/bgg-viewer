<script lang="ts">
  /**
   * The tool's Network view: one game's ego network on a `PointCanvas`, the sibling of
   * `GenealogyLayer` (spec: docs/superpowers/specs/2026-11-11-genealogy-network-flip-design.md).
   *
   * Drawn from the bench's `NetworkLayer`, re-styled to the tool's shared encodings
   * (`lineage-encoding.ts`) so a flip from the tree changes only positions and links: centre in
   * the accent, every other game one colour, size by ratings, upcoming hollow. Links are
   * curved, thickness by similarity; mutual solid, one-way dashed and faint (`links="all"`).
   *
   * Motion is the page's `Glide`, as in the tree: a change of centre, k or hops, or a flip from
   * the tree, is one glide, with links and labels travelling with their games. The data square
   * is stretched over the canvas like the tree's (so a flip never moves the camera); the
   * layout's square is corrected for the canvas's aspect here, so the graph isn't distorted.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import { egoParents, type NetworkLayout } from './network';
  import { dashed } from './genealogy-layout';
  import { useSurface, type Driver, type Line, type OverlayApi } from './surface';
  import { toRgb } from './palette';
  import { ring, glow, labels } from './ink';
  import type { LabelInput } from './labels';
  import type { Glide } from './glide.svelte';
  import { lineagePalette, bucketOf, diameter } from './lineage-encoding';

  let {
    coords,
    facts,
    layout,
    glide,
    links = 'mutual',
    selected = -1,
    onselect
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: NetworkLayout;
    glide: Glide;
    links?: 'mutual' | 'all';
    /** The selected game's index, -1 for none. */
    selected?: number;
    onselect?: (i: number) => void;
  } = $props();

  const surface = useSurface();
  if (!surface) throw new Error('EgoLayer must be mounted inside a PointCanvas');

  const n = $derived(coords.ids.length);
  const g = $derived(layout.graph);
  const centre = $derived(g.source);
  const hopOf = $derived(new Map(g.nodes.map((x) => [x.i, x.hop])));
  const simOf = $derived(new Map(g.nodes.map((x) => [x.i, x.sim])));
  const parents = $derived(egoParents(g));

  /** Target positions: the layout's square, narrowed to the canvas's aspect (it's stretched). */
  const pos = $derived.by(() => {
    const w = surface.width, h = surface.height;
    const a = w > 0 && h > 0 ? w / h : 1;
    const sx = a > 1 ? 1 / a : 1, sy = a < 1 ? a : 1;
    const x = new Float32Array(n), y = new Float32Array(n);
    g.nodes.forEach((node, j) => { x[node.i] = layout.x[j] * sx; y[node.i] = layout.y[j] * sy; });
    return { x, y };
  });

  // --- motion: the page's Glide, shared with the tree --------------------------------------
  $effect(() => {
    glide.to({ centre: g.source, nodes: g.nodes.map((nd) => ({ i: nd.i, via: parents.get(nd.i) ?? -1 })) }, pos);
  });
  const cur = $derived(glide.cur);
  const leaving = $derived(glide.leaving);

  const palette = $derived(lineagePalette(surface.theme));
  const diameterOf = (i: number) => diameter(facts, i, centre);
  const colour = $derived.by(() => {
    const c = new Uint8Array(n);
    for (const nd of g.nodes) c[nd.i] = bucketOf(facts, nd.i, centre);
    for (const l of leaving) c[l.i] = bucketOf(facts, l.i, centre);
    return c;
  });
  const size = $derived.by(() => {
    const s = new Uint8Array(n);
    for (const nd of g.nodes) s[nd.i] = diameterOf(nd.i);
    for (const l of leaving) s[l.i] = diameterOf(l.i);
    return s;
  });
  const visible = $derived([...g.nodes.map((nd) => nd.i), ...leaving.map((l) => l.i)]);

  /** Hop-2+ games worth naming: the hubs of the outer knots, by mutual degree. */
  const HUB_LABELS = 6;
  const hubs = $derived.by(() => {
    const deg = new Map<number, number>();
    for (const e of g.edges) if (e.mutual) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
    return new Set(g.nodes.filter((x) => x.hop >= 2).sort((p, q) => (deg.get(q.i) ?? 0) - (deg.get(p.i) ?? 0)).slice(0, HUB_LABELS).map((x) => x.i));
  });
  const edges = $derived(g.edges.filter((e) => links === 'all' || e.mutual));

  /** A curved edge, bowed to one consistent side of its chord (as the bench draws them). */
  const CURVATURE = 0.18, FULL_BOW_LENGTH = 0.5, SEGMENTS = 14;
  function curve(a: number, b: number): [number, number][] {
    const x1 = cur.x[a], y1 = cur.y[a], x2 = cur.x[b], y2 = cur.y[b];
    const dx = x2 - x1, dy = y2 - y1;
    const bow = CURVATURE * Math.min(1, Math.hypot(dx, dy) / FULL_BOW_LENGTH);
    if (bow < 0.005) return [[x1, y1], [x2, y2]];
    const s = a < b ? 1 : -1;
    const cx = (x1 + x2) / 2 - dy * bow * s, cy = (y1 + y2) / 2 + dx * bow * s;
    const pts: [number, number][] = [];
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS, u = 1 - t;
      pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
    }
    return pts;
  }

  const DASH_ON = 0.018, DASH_OFF = 0.012;
  const lines = $derived.by<Line[]>(() => {
    const t = surface.theme;
    if (!t) return [];
    const ink = toRgb(t.foreground).map((c) => c / 255) as [number, number, number];
    const accent = toRgb(t.accent).map((c) => c / 255) as [number, number, number];
    // Feathered like the tree's: regl's line shader has no anti-aliasing of its own.
    const PASSES: [number, number][] = [[2.2, 0.08], [1.6, 0.2], [1, 1]];
    const layers: Line[][] = PASSES.map(() => []);
    const stroke = (points: [number, number][], rgb: [number, number, number], alpha: number, width: number) =>
      PASSES.forEach(([wm, am], k) => layers[k].push({ points, color: [...rgb, alpha * am], width: width * wm }));
    // A game folding away keeps a faint link to the game it hung off until it lands.
    for (const l of leaving) if (l.via >= 0) stroke(curve(l.via, l.i), ink, 0.25, 1.2);
    let lo = Infinity, hi = -Infinity;
    for (const e of edges) { lo = Math.min(lo, e.sim); hi = Math.max(hi, e.sim); }
    for (const e of edges) {
      const lit = e.a === selected || e.b === selected;
      const r = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
      // The outer rings' own wiring is kept lighter than the spokes in, so a dense family
      // reads as a texture rather than a wash.
      const outer = (hopOf.get(e.a) ?? 2) >= 2 && (hopOf.get(e.b) ?? 2) >= 2;
      const alpha = lit ? 1 : (e.mutual ? 0.35 + 0.5 * r : 0.25) * (outer ? 0.6 : 1);
      const width = (1.2 + r * 1.6) * (lit ? 1.3 : e.mutual ? 1 : 0.8);
      const rgb = lit ? accent : ink;
      const path = curve(e.a, e.b);
      if (e.mutual) stroke(path, rgb, alpha, width);
      else for (const d of dashed(path, DASH_ON, DASH_OFF)) stroke(d, rgb, alpha, width);
    }
    return layers.flat();
  });

  /** The hovered game and where it is, for the hover card. */
  let tip = $state.raw<{ i: number; x: number; y: number } | null>(null);
  const yearOf = (i: number) => facts.year[i] || '—';

  function paint(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen, hovered } = api;
    if (!api.drawn || api.dragging) { tip = null; return; }
    const at = new Map<number, [number, number]>();
    for (const nd of g.nodes) { const p = screen(nd.i); if (p) at.set(nd.i, p); }
    const rad = (i: number) => (diameterOf(i) / 2) * api.pointScale;

    const cp = at.get(centre);
    if (cp) glow(ctx, cp[0], cp[1], rad(centre) * 3, theme.accent, 0.35);
    const want: { i: number; l: LabelInput }[] = [];
    const wanted = (i: number, hop: number) => i === selected || i === hovered || hop <= 1 || hubs.has(i);
    for (const nd of g.nodes) {
      const p = at.get(nd.i);
      if (!p) continue;
      const r = rad(nd.i);
      if (nd.i === centre) ring(ctx, p[0], p[1], r + 2, theme.foreground, theme.background, 2.5);
      if (nd.i !== centre && facts.upcoming[nd.i] === 1) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ring(ctx, p[0], p[1], r, theme.foreground, theme.background, 1.2);
        ctx.restore();
      }
      if (nd.i === selected) ring(ctx, p[0], p[1], r + 3, theme.accent, theme.background, 2);
      if (nd.i === hovered && nd.i !== selected) ring(ctx, p[0], p[1], r + 3, theme.foreground, theme.background, 1.5);
      if (wanted(nd.i, nd.hop)) want.push({ i: nd.i, l: { x: p[0], y: p[1], text: facts.name(coords.ids[nd.i]), gap: r + 4 } });
    }
    // The placer keeps a label only if it clears those before it, so order is priority:
    // centre, selected, hovered, then nearer rings, then the most-rated.
    const rank = (i: number) => (i === centre ? 0 : i === selected ? 1 : i === hovered ? 2 : 3 + (hopOf.get(i) ?? 3));
    want.sort((p, q) => rank(p.i) - rank(q.i) || facts.usersRated[q.i] - facts.usersRated[p.i]);
    labels(ctx, want.map((w) => w.l), api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true });
    const hp = hovered >= 0 && hopOf.has(hovered) ? at.get(hovered) : undefined;
    tip = hp ? { i: hovered, x: hp[0], y: hp[1] } : null;
  }

  const driver: Driver = {
    get x() { return cur.x; },
    get y() { return cur.y; },
    get colour() { return colour; },
    get palette() { return palette; },
    get size() { return size; },
    get visible() { return visible; },
    // No camera refit, as in the tree: the layout already fits, and a flip never moves the camera.
    focus: null,
    get lines() { return lines; },
    stretch: true,
    instant: true,
    opacity: 0.95,
    onselect: (points) => { if (points.length === 1) onselect?.(points[0]); },
    overlay: paint
  };
  $effect(() => {
    surface.drive(driver);
    return () => surface.release(driver);
  });
  $effect(() => { void lines; void selected; surface.repaint(); });
</script>

<!-- PLACEHOLDER COPY (Phil): hover card. -->
{#if tip}
  <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px">
    <div class="name">{facts.name(coords.ids[tip.i])}</div>
    <div class="meta">
      {yearOf(tip.i)} · {facts.usersRated[tip.i].toLocaleString()} ratings{#if tip.i !== centre} · {(simOf.get(tip.i) ?? 0).toFixed(2)} to {facts.name(coords.ids[centre])} · ring {hopOf.get(tip.i)}{/if}
    </div>
  </div>
{/if}

<style>
  .tip {
    position: absolute; pointer-events: none; max-width: 18rem; padding: 0.4rem 0.6rem; z-index: 1;
    border: 1px solid var(--border); border-radius: 0.375rem; background: var(--card); color: var(--foreground);
    box-shadow: 0 2px 8px oklch(0 0 0 / 0.12); font-size: 0.8125rem; line-height: 1.3;
  }
  .tip .name { font-weight: 600; }
  .tip .meta { color: var(--muted-foreground); }
</style>
