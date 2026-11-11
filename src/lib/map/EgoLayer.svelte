<script lang="ts">
  /**
   * The tool's Network view: one game's ego network on a `PointCanvas`, the sibling of
   * `GenealogyLayer` (spec: docs/superpowers/specs/2026-11-11-genealogy-network-flip-design.md).
   *
   * Drawn from the bench's `NetworkLayer`, re-styled to the tool's shared encodings
   * (`lineage-encoding.ts`) so a flip from the tree changes only positions and links: centre in
   * the accent, every other game one colour, size by ratings, upcoming hollow. Links are
   * straight, thickness by similarity; mutual solid, one-way dashed and faint. Every game's path
   * link back to the centre is always drawn; `links` picks the rest (`shownEdges`).
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
  import { egoParents, shownEdges, type NetworkLayout } from './network';
  import { useSurface, type Driver, type OverlayApi } from './surface';
  import { ring, glow, labels } from './ink';
  import type { LabelInput } from './labels';
  import type { Snippet } from 'svelte';
  import PinnedCard from './PinnedCard.svelte';
  import type { Glide } from './glide.svelte';
  import { lineagePalette, bucketOf, diameter, framer } from './lineage-encoding';

  let {
    coords,
    facts,
    layout,
    glide,
    links = 'mutual',
    selected = -1,
    card,
    onselect,
    onclear
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: NetworkLayout;
    glide: Glide;
    links?: 'mutual' | 'all';
    /** The selected game's index, -1 for none. */
    selected?: number;
    /** The selected game's card contents, pinned beside its dot (`PinnedCard`). */
    card?: Snippet;
    onselect?: (i: number) => void;
    /** A click on empty canvas. */
    onclear?: () => void;
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
  /** The layout's fit, moved into the canvas minus the room the HUD and labels need. */
  const frame = $derived(framer(surface.width, surface.height));
  const pos = $derived.by(() => {
    // The framed box's aspect, not the canvas's: the layout's square goes into the box.
    const w = frame.w, h = frame.h;
    const a = w > 0 && h > 0 ? w / h : 1;
    const sx = a > 1 ? 1 / a : 1, sy = a < 1 ? a : 1;
    const x = new Float32Array(n), y = new Float32Array(n);
    g.nodes.forEach((node, j) => { x[node.i] = frame.x(layout.x[j] * sx); y[node.i] = frame.y(layout.y[j] * sy); });
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
  /** Each game's path link back to the centre always; the rest by `links`. */
  const edges = $derived(shownEdges(g, parents, links));

  /**
   * Links, painted under the points on the canvas's 2-D underlay: one straight stroke per
   * link, from the points' on-screen (mid-glide) positions, so links travel with their games.
   * Not regl lines: those rebuild all their geometry on every change, quadratic in vertex
   * count, which froze a 2,000-link glide for over a second (profiled 2026-11-11). Canvas
   * strokes are anti-aliased, so no feathering passes either.
   */
  function underlay(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen } = api;
    if (!api.drawn) return;
    // Straight: the bow these used to have went to a side set by the games' indices, not the
    // layout, so neighbouring links swung every which way (Phil, 2026-11-11).
    const link = (a: number, b: number) => {
      const pa = screen(a), pb = screen(b);
      if (!pa || !pb) return false;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      return true;
    };
    ctx.save();
    ctx.lineCap = 'round';
    // A game folding away keeps a faint link to the game it hung off until it lands.
    ctx.strokeStyle = theme.foreground; ctx.globalAlpha = 0.25; ctx.lineWidth = 1.2;
    for (const l of leaving) if (l.via >= 0 && link(l.via, l.i)) ctx.stroke();
    let lo = Infinity, hi = -Infinity;
    for (const e of edges) { lo = Math.min(lo, e.sim); hi = Math.max(hi, e.sim); }
    for (const e of edges) {
      const lit = e.a === selected || e.b === selected;
      const r = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
      // The outer rings' own wiring is kept lighter than the spokes in, so a dense family
      // reads as a texture rather than a wash.
      const outer = (hopOf.get(e.a) ?? 2) >= 2 && (hopOf.get(e.b) ?? 2) >= 2;
      ctx.globalAlpha = lit ? 1 : (e.mutual ? 0.35 + 0.5 * r : 0.25) * (outer ? 0.6 : 1);
      ctx.strokeStyle = lit ? theme.accent : theme.foreground;
      ctx.lineWidth = (1.2 + r * 1.6) * (lit ? 1.3 : e.mutual ? 1 : 0.8);
      ctx.setLineDash(e.mutual ? [] : [6, 4]);
      if (link(e.a, e.b)) ctx.stroke();
    }
    ctx.restore();
  }

  /** The hovered game and where it is, for the hover card. */
  let tip = $state.raw<{ i: number; x: number; y: number } | null>(null);
  /** The text's fade, for the HTML laid over the canvas (badges, hover card): set in paint. */
  let textAlpha = $state(1);
  /** The selected game's dot on screen, for its pinned card; and the canvas it sits in. */
  let pin = $state.raw<{ x: number; y: number; r: number; w: number; h: number } | null>(null);
  const yearOf = (i: number) => facts.year[i] || '—';

  function paint(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen, hovered } = api;
    if (!api.drawn) { tip = null; pin = null; return; }
    const at = new Map<number, [number, number]>();
    for (const nd of g.nodes) { const p = screen(nd.i); if (p) at.set(nd.i, p); }
    const rad = (i: number) => (diameterOf(i) / 2) * api.pointScale;

    // The chosen game's glow and ring, and the selection's: always, tracking their dots.
    const cp = at.get(centre);
    if (cp) {
      glow(ctx, cp[0], cp[1], rad(centre) * 3, theme.accent, 0.35);
      ring(ctx, cp[0], cp[1], rad(centre) + 2, theme.foreground, theme.background, 2.5);
    }
    const sp = selected >= 0 ? at.get(selected) : undefined;
    if (sp) ring(ctx, sp[0], sp[1], rad(selected) + 3, theme.accent, theme.background, 2);
    pin = sp ? { x: sp[0], y: sp[1], r: rad(selected) + 3, w: api.width, h: api.height } : null;

    // Labels wait for the games to land and the camera to rest, then fade in (as in the tree).
    const settle = Math.min(glide.settle, api.rest);
    textAlpha = settle;
    if (settle === 0) { tip = null; return; }
    ctx.save();
    ctx.globalAlpha = settle;
    const want: { i: number; l: LabelInput }[] = [];
    // Not hover or selection: those used to add and promote labels, reshuffling the ones
    // around the cursor. The hover card and the selected panel name the game instead.
    const wanted = (hop: number, i: number) => hop <= 1 || hubs.has(i);
    for (const nd of g.nodes) {
      const p = at.get(nd.i);
      if (!p) continue;
      const r = rad(nd.i);
      if (nd.i !== centre && facts.upcoming[nd.i] === 1) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ring(ctx, p[0], p[1], r, theme.foreground, theme.background, 1.2);
        ctx.restore();
      }
      if (nd.i === hovered && nd.i !== selected) ring(ctx, p[0], p[1], r + 3, theme.foreground, theme.background, 1.5);
      if (wanted(nd.hop, nd.i)) want.push({ i: nd.i, l: { x: p[0], y: p[1], text: facts.name(coords.ids[nd.i]), gap: r + 4 } });
    }
    // The placer keeps a label only if it clears those before it, so order is priority:
    // centre, then nearer rings, then the most-rated.
    const rank = (i: number) => (i === centre ? 0 : 1 + (hopOf.get(i) ?? 3));
    want.sort((p, q) => rank(p.i) - rank(q.i) || facts.usersRated[q.i] - facts.usersRated[p.i]);
    labels(ctx, want.map((w) => w.l), api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true });
    ctx.restore();
    const hp = hovered >= 0 && hopOf.has(hovered) ? at.get(hovered) : undefined;
    // No hover card over the pinned game: its card is already there.
    tip = hp && !api.dragging && hovered !== selected ? { i: hovered, x: hp[0], y: hp[1] } : null;
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
    underlay,
    stretch: true,
    instant: true,
    opacity: 0.95,
    onselect: (points) => { if (points.length === 1) onselect?.(points[0]); },
    onclear: () => onclear?.(),
    overlay: paint
  };
  $effect(() => {
    surface.drive(driver);
    return () => surface.release(driver);
  });
  // Links and rings follow the selection and the link filter; the glide repaints after each draw.
  $effect(() => { void selected; void edges; void glide.settle; surface.repaint(); });
</script>

{#if pin && card}
  <PinnedCard x={pin.x} y={pin.y} r={pin.r} width={pin.w} height={pin.h} alpha={textAlpha}>{@render card()}</PinnedCard>
{/if}

<!-- PLACEHOLDER COPY (Phil): hover card. -->
{#if tip}
  <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px" style:opacity={textAlpha}>
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
