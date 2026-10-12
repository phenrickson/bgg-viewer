<script lang="ts">
  /**
   * One game's genealogy as a layer on a `PointCanvas` — a sibling of `NetworkLayer` with
   * its own encodings (see the genealogy spec):
   * - colour by side: ancestors, descendants, same-year, the centre in the accent;
   *   upcoming games hollow (background fill, dashed ring);
   * - size by ratings (log), so an obscure game reads as obscure without being filtered;
   * - edges thick with similarity; solid = similarity only, dashed = same family, double =
   *   reimplementation / expansion; the selected game's edges in the accent;
   * - ⊕ (unfold, with how many are waiting) and "+N more" as HTML buttons placed from the
   *   overlay's screen positions; axis ticks (years or generations) painted on the overlay.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { Dir } from './genealogy';
  import { ndcToScreen, dashed, offset, type GenealogyLayout } from './genealogy-layout';
  import { useSurface, type Driver, type Line, type OverlayApi } from './surface';
  import { toRgb } from './palette';
  import { ring, glow, labels } from './ink';
  import type { LabelInput } from './labels';

  let {
    coords,
    facts,
    layout,
    selected = -1,
    onselect,
    onunfold,
    onmore
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: GenealogyLayout;
    /** The selected game's index, -1 for none. */
    selected?: number;
    onselect?: (i: number) => void;
    onunfold?: (i: number) => void;
    onmore?: (i: number, dir: Dir) => void;
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
  const colour = $derived.by(() => {
    const c = new Uint8Array(n);
    for (const nd of g.nodes) c[nd.i] = nd.side !== 'centre' && facts.upcoming[nd.i] ? UPCOMING : BUCKET[nd.side];
    return c;
  });

  /** Diameter from ratings on a log scale: 30 ratings → 5px, 100k → 18px. */
  const LOG_LO = Math.log10(30), LOG_HI = 5;
  function diameter(i: number): number {
    const t = (Math.log10(Math.max(1, facts.usersRated[i])) - LOG_LO) / (LOG_HI - LOG_LO);
    return Math.round(5 + Math.min(1, Math.max(0, t)) * 13);
  }
  const size = $derived.by(() => {
    const s = new Uint8Array(n);
    for (const nd of g.nodes) s[nd.i] = diameter(nd.i);
    return s;
  });
  const visible = $derived(g.nodes.map((nd) => nd.i));

  /**
   * An edge from `a` (nearer the centre) to `b`. Up/down edges leave and arrive vertically
   * (a cubic with vertical tangents), so a tree reads as a tree. Same-year edges arc below
   * the row instead, or every one would run straight through the games between.
   */
  const SEGMENTS = 16;
  function edgePath(a: number, b: number, same: boolean): [number, number][] {
    const x1 = pos.x[a], y1 = pos.y[a], x2 = pos.x[b], y2 = pos.y[b];
    const h = same ? 0.25 * Math.abs(x2 - x1) : 0;
    const c1: [number, number] = same ? [x1, y1 - h] : [x1, (y1 + y2) / 2];
    const c2: [number, number] = same ? [x2, y2 - h] : [x2, (y1 + y2) / 2];
    const pts: [number, number][] = [];
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      pts.push([w0 * x1 + w1 * c1[0] + w2 * c2[0] + w3 * x2, w0 * y1 + w1 * c1[1] + w2 * c2[1] + w3 * y2]);
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
    const edges = g.nodes.slice(1);
    let lo = Infinity, hi = -Infinity;
    for (const e of edges) { lo = Math.min(lo, e.sim); hi = Math.max(hi, e.sim); }
    for (const e of edges) {
      const lit = e.i === selected || e.via === selected;
      const r = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
      const alpha = lit ? 1 : 0.35 + 0.5 * r;
      const width = (1.2 + r * 1.6) * (lit ? 1.3 : 1);
      const rgb = lit ? accent : ink;
      const path = edgePath(e.via, e.i, e.side === 'same');
      const strokes =
        e.kind === 'family' ? dashed(path, DASH_ON, DASH_OFF)
        : e.kind === 'related' ? [offset(path, DOUBLE_GAP), offset(path, -DOUBLE_GAP)]
        : [path];
      const w = e.kind === 'related' ? width * 0.7 : width;
      for (const points of strokes) {
        PASSES.forEach(([wm, am], k) => layers[k].push({ points, color: [...rgb, alpha * am], width: w * wm }));
      }
    }
    return layers.flat();
  });

  type Mark = { key: string; x: number; y: number; label: string; act: () => void };
  /** Written from inside `overlay` (like NetworkLayer's `tip`); raw so the closures aren't proxied. */
  let marks = $state.raw<Mark[]>([]);

  const yearOf = (i: number) => facts.year[i] || '—';

  function paint(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen } = api;
    // Nothing mid-flight or mid-drag: the 2-D overlay can't keep step with the GL canvas.
    if (!api.drawn || api.dragging) { marks = []; return; }
    const at = new Map<number, [number, number]>();
    for (const nd of g.nodes) { const p = screen(nd.i); if (p) at.set(nd.i, p); }

    // Axis: ticks need NDC → screen, which two placed nodes at distinct NDC pin down.
    const placed = g.nodes.map((nd, j) => ({ j, p: at.get(nd.i) })).filter((v) => v.p);
    const a = placed[0];
    const b = placed.find((v) => layout.x[v.j] !== layout.x[a?.j ?? 0] || layout.y[v.j] !== layout.y[a?.j ?? 0]);
    const map = a && b
      ? ndcToScreen({ ndc: [layout.x[a.j], layout.y[a.j]], px: a.p! }, { ndc: [layout.x[b.j], layout.y[b.j]], px: b.p! })
      : null;
    if (map) {
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      for (const tk of layout.ticks) {
        const [, sy] = map(0, tk.y);
        if (sy < 0 || sy > api.height) continue;
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = theme.foreground;
        ctx.beginPath(); ctx.moveTo(40, sy); ctx.lineTo(api.width, sy); ctx.stroke();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = theme.foreground;
        ctx.fillText(tk.label, 6, sy);
      }
      ctx.restore();
    }

    const rad = (i: number) => (diameter(i) / 2) * api.pointScale;
    const centre = g.nodes[0];
    const cp = at.get(centre.i);
    if (cp) glow(ctx, cp[0], cp[1], rad(centre.i) * 3, theme.accent, 0.35);

    const want: LabelInput[] = [];
    for (const nd of g.nodes) {
      const p = at.get(nd.i);
      if (!p) continue;
      const r = rad(nd.i);
      if (nd.side === 'centre') ring(ctx, p[0], p[1], r + 2, theme.foreground, theme.background, 2.5);
      if (nd.side !== 'centre' && facts.upcoming[nd.i]) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ring(ctx, p[0], p[1], r, theme.foreground, theme.background, 1.2);
        ctx.restore();
      }
      if (nd.i === selected) ring(ctx, p[0], p[1], r + 3, theme.accent, theme.background, 2);
      want.push({ x: p[0], y: p[1], text: `${facts.name(coords.ids[nd.i])} (${yearOf(nd.i)})`, gap: r + 4 });
    }
    // Priority: the centre, the selected game, then tree order (strongest first per unfold).
    const sel = selected >= 0 ? at.get(selected) : undefined;
    if (sel) want.sort((l, r) => Number(r.x === sel[0] && r.y === sel[1]) - Number(l.x === sel[0] && l.y === sel[1]));
    labels(ctx, want, api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true });

    const next: Mark[] = [];
    const push = (i: number, dir: Dir, count: number, folded: boolean) => {
      const p = at.get(i);
      if (!p || count <= 0) return;
      const r = rad(i) + 12;
      const [x, y] = dir === 'up' ? [p[0], p[1] - r] : dir === 'down' ? [p[0], p[1] + r] : [p[0] + r + 24, p[1]];
      next.push(folded
        ? { key: `u${i}`, x, y, label: `⊕ ${count}`, act: () => onunfold?.(i) }
        : { key: `m${i}:${dir}`, x, y, label: `+${count} more`, act: () => onmore?.(i, dir) });
    };
    for (const dir of ['up', 'down', 'same'] as const) push(centre.i, dir, g.centreHidden[dir], false);
    for (const nd of g.nodes) if (nd.side === 'up' || nd.side === 'down') push(nd.i, nd.side, nd.hidden, !nd.unfolded);
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
  .mark {
    position: absolute; transform: translate(-50%, -50%); padding: 0.05rem 0.4rem;
    border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--foreground);
    font-size: 0.72rem; line-height: 1.3; white-space: nowrap; cursor: pointer;
  }
  .mark:hover, .mark:focus-visible { border-color: var(--primary); }
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
