<script lang="ts">
  /**
   * One game's genealogy as a layer on a `PointCanvas` — a sibling of `NetworkLayer` with
   * its own encodings (see the genealogy spec):
   * - colour by side: ancestors, descendants, same-year, the centre in the accent;
   *   upcoming games hollow (background fill, dashed ring) at a fixed size — they have no
   *   ratings yet;
   * - size by ratings (log), so an obscure game reads as obscure without being filtered;
   * - edges curve from parent to child, leaving and arriving vertically, so the view reads
   *   as lines meeting at the chosen game; same-year games hang off shallow arcs along the
   *   centre's row. Thick with similarity; solid = similarity only, dashed = same family,
   *   double = reimplementation / expansion;
   * - ⊕N (unfold, N waiting) and ⊖ (fold) as a token at the end of the game's label, so
   *   the label placer reserves its room, with an HTML button laid over it. "+N more" past
   *   the cap, and the centre's own overflow, live in the side panel and the controls;
   * - year or generation labels down the left edge.
   *
   * The data square is stretched over the whole canvas (`stretch`), so the tree uses the
   * canvas's width rather than a centred square.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { Dir, GenealogyNode } from './genealogy';
  import { ndcToScreenY, badgeCentre, labelOrder, sameYearArc, dashed, offset, type GenealogyLayout } from './genealogy-layout';
  import { useSurface, type Driver, type Line, type OverlayApi } from './surface';
  import { toRgb } from './palette';
  import { ring, glow, labels, LABEL_METRICS } from './ink';
  import type { LabelInput } from './labels';

  let {
    coords,
    facts,
    layout,
    selected = -1,
    onselect,
    onunfold,
    onfold
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: GenealogyLayout;
    /** The selected game's index, -1 for none. */
    selected?: number;
    onselect?: (i: number) => void;
    onunfold?: (i: number) => void;
    onfold?: (i: number) => void;
  } = $props();

  const surface = useSurface();
  if (!surface) throw new Error('GenealogyLayer must be mounted inside a PointCanvas');

  const n = $derived(coords.ids.length);
  const g = $derived(layout.genealogy);

  const pos = $derived.by(() => {
    const x = new Float32Array(n), y = new Float32Array(n);
    g.nodes.forEach((nd, j) => { x[nd.i] = layout.x[j]; y[nd.i] = layout.y[j]; });
    return { x, y };
  });

  /** Colour buckets, indexing `palette`. */
  const BUCKET = { up: 0, down: 1, same: 2, centre: 3 } as const;
  const UPCOMING = 4;
  const palette = $derived.by(() => {
    const t = surface.theme;
    return t ? [t.chart[0], t.chart[1], t.muted, t.accent, t.background] : [];
  });
  const isUpcoming = (nd: GenealogyNode) => nd.side !== 'centre' && facts.upcoming[nd.i] === 1;
  const colour = $derived.by(() => {
    const c = new Uint8Array(n);
    for (const nd of g.nodes) c[nd.i] = isUpcoming(nd) ? UPCOMING : BUCKET[nd.side];
    return c;
  });

  /** Diameter from ratings on a log scale: 30 ratings → 5px, 100k → 18px. Upcoming: fixed. */
  const LOG_LO = Math.log10(30), LOG_HI = 5;
  const UPCOMING_DIAMETER = 10;
  function diameter(i: number): number {
    if (facts.upcoming[i] === 1 && i !== g.centre) return UPCOMING_DIAMETER;
    const t = (Math.log10(Math.max(1, facts.usersRated[i])) - LOG_LO) / (LOG_HI - LOG_LO);
    return Math.round(5 + Math.min(1, Math.max(0, t)) * 13);
  }
  const size = $derived.by(() => {
    const s = new Uint8Array(n);
    for (const nd of g.nodes) s[nd.i] = diameter(nd.i);
    return s;
  });
  const visible = $derived(g.nodes.map((nd) => nd.i));

  /** An edge from parent `a` to child `b`: a cubic with vertical tangents at both ends. */
  const SEGMENTS = 16;
  function edgePath(a: number, b: number): [number, number][] {
    const x1 = pos.x[a], y1 = pos.y[a], x2 = pos.x[b], y2 = pos.y[b], ym = (y1 + y2) / 2;
    const pts: [number, number][] = [];
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      pts.push([(w0 + w1) * x1 + (w2 + w3) * x2, w0 * y1 + (w1 + w2) * ym + w3 * y2]);
    }
    return pts;
  }

  /** Dash and double-line spacing, NDC. */
  const DASH_ON = 0.018, DASH_OFF = 0.012, DOUBLE_GAP = 0.004;
  const lines = $derived.by<Line[]>(() => {
    const t = surface.theme;
    if (!t) return [];
    const ink = toRgb(t.foreground).map((c) => c / 255) as [number, number, number];
    const accent = toRgb(t.accent).map((c) => c / 255) as [number, number, number];
    // Feathered like NetworkLayer's: regl's line shader has no anti-aliasing of its own.
    const PASSES: [number, number][] = [[2.2, 0.08], [1.6, 0.2], [1, 1]];
    const layers: Line[][] = PASSES.map(() => []);
    const stroke = (points: [number, number][], rgb: [number, number, number], alpha: number, width: number) =>
      PASSES.forEach(([wm, am], k) => layers[k].push({ points, color: [...rgb, alpha * am], width: width * wm }));
    const edges = g.nodes.filter((nd) => nd.side !== 'centre');
    let lo = Infinity, hi = -Infinity;
    for (const e of edges) { lo = Math.min(lo, e.sim); hi = Math.max(hi, e.sim); }
    for (const e of edges) {
      const lit = e.i === selected || e.via === selected;
      const r = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
      const alpha = lit ? 1 : 0.35 + 0.5 * r;
      const width = (1.2 + r * 1.6) * (lit ? 1.3 : 1);
      const rgb = lit ? accent : ink;
      const path = e.side === 'same'
        ? sameYearArc([pos.x[e.via], pos.y[e.via]], [pos.x[e.i], pos.y[e.i]])
        : edgePath(e.via, e.i);
      if (e.kind === 'family') for (const d of dashed(path, DASH_ON, DASH_OFF)) stroke(d, rgb, alpha, width);
      else if (e.kind === 'related') { stroke(offset(path, DOUBLE_GAP), rgb, alpha, width * 0.7); stroke(offset(path, -DOUBLE_GAP), rgb, alpha, width * 0.7); }
      else stroke(path, rgb, alpha, width);
    }
    return layers.flat();
  });

  type Mark = { key: string; x: number; y: number; label: string; act: () => void };
  /** Written from inside `overlay` (like NetworkLayer's `tip`); raw so the closures aren't proxied. */
  let marks = $state.raw<Mark[]>([]);
  /** The hovered game and where it is, for the hover card. */
  let tip = $state.raw<{ i: number; x: number; y: number } | null>(null);
  const byIndex = $derived(new Map(g.nodes.map((nd) => [nd.i, nd])));

  const yearOf = (i: number) => facts.year[i] || '—';
  /** The badge token a game's label ends with, or null: ⊕N to unfold, ⊖ to fold. One word, so it never wraps apart. */
  function token(nd: GenealogyNode): string | null {
    if (nd.side !== 'up' && nd.side !== 'down') return null;
    if (nd.unfolded) return '⊖';
    return nd.hidden > 0 ? `⊕${nd.hidden}` : null;
  }

  function paint(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen } = api;
    // Nothing mid-flight or mid-drag: the 2-D overlay can't keep step with the GL canvas.
    if (!api.drawn || api.dragging) { marks = []; tip = null; return; }
    const at = new Map<number, [number, number]>();
    for (const nd of g.nodes) { const p = screen(nd.i); if (p) at.set(nd.i, p); }

    // Axis labels down the left edge; the y map comes from two placed nodes at distinct y.
    const placed = g.nodes.map((nd, j) => ({ j, p: at.get(nd.i) })).filter((v) => v.p);
    const a = placed[0];
    const b = a && placed.find((v) => layout.y[v.j] !== layout.y[a.j]);
    const toPy = a && b ? ndcToScreenY({ y: layout.y[a.j], py: a.p![1] }, { y: layout.y[b.j], py: b.p![1] }) : null;
    if (toPy) {
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = theme.foreground;
      for (const tk of layout.ticks) {
        const sy = toPy(tk.y);
        if (sy >= 0 && sy <= api.height) ctx.fillText(tk.label, 6, sy);
      }
      ctx.restore();
    }

    const rad = (i: number) => (diameter(i) / 2) * api.pointScale;
    const centre = g.nodes[0];
    const cp = at.get(centre.i);
    if (cp) glow(ctx, cp[0], cp[1], rad(centre.i) * 3, theme.accent, 0.35);

    const input = new Map<number, LabelInput>();
    for (const nd of g.nodes) {
      const p = at.get(nd.i);
      if (!p) continue;
      const r = rad(nd.i);
      if (nd.side === 'centre') ring(ctx, p[0], p[1], r + 2, theme.foreground, theme.background, 2.5);
      if (isUpcoming(nd)) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ring(ctx, p[0], p[1], r, theme.foreground, theme.background, 1.2);
        ctx.restore();
      }
      if (nd.i === selected) ring(ctx, p[0], p[1], r + 3, theme.accent, theme.background, 2);
      if (nd.i === api.hovered && nd.i !== selected) ring(ctx, p[0], p[1], r + 3, theme.foreground, theme.background, 1.5);
      const tk = token(nd);
      input.set(nd.i, { x: p[0], y: p[1], text: `${facts.name(coords.ids[nd.i])} (${yearOf(nd.i)})${tk ? ` ${tk}` : ''}`, gap: r + 4 });
    }
    // The placer keeps a label only if it fits clear of those before it: see `labelOrder`.
    const unfolded = new Set(g.nodes.filter((nd) => nd.unfolded && nd.side !== 'centre').map((nd) => nd.i));
    const order = labelOrder([...input.keys()], g.centre, selected, api.hovered, facts.usersRated, unfolded);
    const want = order.map((i) => input.get(i)!);
    const boxes = new Map<number, { bx: number; by: number; lines: string[] }>();
    // Placed labels come back as new objects; their anchor says whose they are.
    const owner = new Map(order.map((i) => [`${input.get(i)!.x},${input.get(i)!.y}`, i]));
    for (const pl of labels(ctx, want, api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true })) {
      const i = owner.get(`${pl.x},${pl.y}`);
      if (i != null) boxes.set(i, pl);
    }

    // A button over each placed label's badge token. A game without a label gets none — its
    // unfold is in the side panel, and the hover card names it.
    const next: Mark[] = [];
    const measure = (t: string) => ctx.measureText(t).width;
    for (const nd of g.nodes) {
      const tk = token(nd);
      const box = boxes.get(nd.i);
      if (!tk || !box || (nd.side !== 'up' && nd.side !== 'down')) continue;
      const [x, y] = badgeCentre(box, measure, tk, LABEL_METRICS);
      next.push({
        key: `${nd.unfolded ? 'f' : 'u'}${nd.i}`, x, y, label: tk,
        act: nd.unfolded ? () => onfold?.(nd.i) : () => onunfold?.(nd.i)
      });
    }
    const hp = api.hovered >= 0 && byIndex.has(api.hovered) ? at.get(api.hovered) : undefined;
    tip = hp ? { i: api.hovered, x: hp[0], y: hp[1] } : null;
    marks = next;
  }

  const driver: Driver = {
    get x() { return pos.x; },
    get y() { return pos.y; },
    get colour() { return colour; },
    get palette() { return palette; },
    get size() { return size; },
    get visible() { return visible; },
    // Refit after every change: an unfold can grow the tree past the current view.
    get focus() { return visible; },
    get lines() { return lines; },
    stretch: true,
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

{#each marks as m (m.key)}
  <button type="button" class="mark" style:left="{m.x}px" style:top="{m.y}px" onclick={m.act}>{m.label}</button>
{/each}

<!-- PLACEHOLDER COPY (Phil): hover card and legend labels. -->
{#if tip}
  {@const nd = byIndex.get(tip.i)}
  {#if nd}
    <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px">
      <div class="name">{facts.name(coords.ids[nd.i])}</div>
      <div class="meta">
        {yearOf(nd.i)} · {facts.usersRated[nd.i].toLocaleString()} ratings{#if nd.side !== 'centre'} · {nd.sim.toFixed(2)} to {facts.name(coords.ids[nd.via])}{/if}
      </div>
      {#if (nd.side === 'up' || nd.side === 'down') && nd.hidden > 0}
        <div class="meta">{nd.unfolded ? `+${nd.hidden} more past the cap — select to show` : `⊕${nd.hidden} ${nd.side === 'up' ? 'earlier' : 'later'} to unfold`}</div>
      {/if}
    </div>
  {/if}
{/if}

<!-- PLACEHOLDER COPY (Phil): legend labels. -->
<div class="legend">
  <div class="legend-title">Games</div>
  <div class="swatch-row"><i style:background="var(--map-cat-1)"></i> earlier</div>
  <div class="swatch-row"><i style:background="var(--map-cat-2)"></i> later</div>
  <div class="swatch-row"><i style:background="var(--muted-foreground)"></i> same year</div>
  <div class="swatch-row"><i class="hollow"></i> upcoming</div>
  <div class="legend-title rule">Links</div>
  <div class="swatch-row"><b class="solid"></b> similar</div>
  <div class="swatch-row"><b class="dashed"></b> same family</div>
  <div class="swatch-row"><b class="double"></b> reimplementation / expansion</div>
</div>

<style>
  /* Laid over the canvas-drawn token, same type, so it covers it exactly. */
  .mark {
    position: absolute; transform: translate(-50%, -50%); padding: 0 0.3rem;
    border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--foreground);
    font-size: 12px; font-weight: 600; line-height: 1.25; white-space: nowrap; cursor: pointer;
  }
  .mark:hover, .mark:focus-visible { border-color: var(--primary); }
  .tip {
    position: absolute; pointer-events: none; max-width: 18rem; padding: 0.4rem 0.6rem; z-index: 1;
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
  .swatch-row i.hollow { border: 1px dashed var(--foreground); }
  .swatch-row b { width: 1rem; height: 0; flex: none; border-top: 1.5px solid var(--foreground); }
  .swatch-row b.dashed { border-top-style: dashed; }
  .swatch-row b.double { border-top-style: double; border-top-width: 4px; }
</style>
