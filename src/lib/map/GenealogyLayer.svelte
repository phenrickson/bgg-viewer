<script lang="ts">
  /**
   * One game's genealogy as a layer on a `PointCanvas` — a sibling of `NetworkLayer` with
   * its own encodings (see the genealogy spec):
   * - colour by side: ancestors, descendants, same-year, the centre in the accent;
   *   upcoming games hollow (background fill, dashed ring) at a fixed size — they have no
   *   ratings yet;
   * - size by ratings (log), so an obscure game reads as obscure without being filtered;
   * - edges as a family-tree comb (trunk, bar, a drop to each child), so siblings visibly
   *   share a parent. Each drop carries its link: thick with similarity; solid = similarity
   *   only, dashed = same family, double = reimplementation / expansion. Same-year games
   *   get no edge — sitting on the centre's row already says it;
   * - ⊕ (unfold, with how many are waiting) and "+N more" as HTML buttons placed just past
   *   their game's label; year or generation labels down the left edge.
   *
   * The data square is stretched over the whole canvas (`stretch`), so the tree uses the
   * canvas's width rather than a centred square.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { Dir, GenealogyNode } from './genealogy';
  import { ndcToScreenY, comb, badgeAt, dashed, offset, type GenealogyLayout } from './genealogy-layout';
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

    // Children grouped by parent and direction; same-year games get no edge.
    const groups = new Map<string, GenealogyNode[]>();
    for (const nd of g.nodes) {
      if (nd.side !== 'up' && nd.side !== 'down') continue;
      const key = `${nd.via}:${nd.side}`;
      const list = groups.get(key);
      if (list) list.push(nd); else groups.set(key, [nd]);
    }
    const edges = g.nodes.filter((nd) => nd.side === 'up' || nd.side === 'down');
    let lo = Infinity, hi = -Infinity;
    for (const e of edges) { lo = Math.min(lo, e.sim); hi = Math.max(hi, e.sim); }

    for (const kids of groups.values()) {
      const parent = kids[0].via;
      const c = comb([pos.x[parent], pos.y[parent]], kids.map((k) => [pos.x[k.i], pos.y[k.i]] as [number, number]));
      const litParent = parent === selected;
      // Trunk and bar belong to the family, not to one link: neutral weight.
      stroke(c.trunk, litParent ? accent : ink, litParent ? 1 : 0.5, 1.4);
      if (c.bar) stroke(c.bar, litParent ? accent : ink, litParent ? 1 : 0.5, 1.4);
      kids.forEach((e, k) => {
        const lit = litParent || e.i === selected;
        const r = hi > lo ? (e.sim - lo) / (hi - lo) : 1;
        const alpha = lit ? 1 : 0.35 + 0.5 * r;
        const width = (1.2 + r * 1.6) * (lit ? 1.3 : 1);
        const rgb = lit ? accent : ink;
        const drop = c.drops[k];
        if (e.kind === 'family') for (const d of dashed(drop, DASH_ON, DASH_OFF)) stroke(d, rgb, alpha, width);
        else if (e.kind === 'related') { stroke(offset(drop, DOUBLE_GAP), rgb, alpha, width * 0.7); stroke(offset(drop, -DOUBLE_GAP), rgb, alpha, width * 0.7); }
        else stroke(drop, rgb, alpha, width);
      });
    }
    return layers.flat();
  });

  type Mark = { key: string; x: number; y: number; label: string; act: () => void };
  /** Written from inside `overlay` (like NetworkLayer's `tip`); raw so the closures aren't proxied. */
  let marks = $state.raw<Mark[]>([]);

  const yearOf = (i: number) => facts.year[i] || '—';
  // PLACEHOLDER COPY (Phil): the centre's overflow badges.
  const CENTRE_MORE: Record<Dir, string> = { up: 'earlier', down: 'later', same: 'same year' };

  function paint(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen } = api;
    // Nothing mid-flight or mid-drag: the 2-D overlay can't keep step with the GL canvas.
    if (!api.drawn || api.dragging) { marks = []; return; }
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

    const want: LabelInput[] = [];
    const wanted = new Map<string, number>(); // label anchor → node index, to find each game's box
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
      want.push({ x: p[0], y: p[1], text: `${facts.name(coords.ids[nd.i])} (${yearOf(nd.i)})`, gap: r + 4 });
      wanted.set(`${p[0]},${p[1]}`, nd.i);
    }
    // Priority: the centre, the selected game, then tree order (strongest first per unfold).
    const sel = selected >= 0 ? at.get(selected) : undefined;
    if (sel) want.sort((l, r) => Number(r.x === sel[0] && r.y === sel[1]) - Number(l.x === sel[0] && l.y === sel[1]));
    const boxes = new Map<number, { bx: number; by: number; bw: number; bh: number }>();
    for (const pl of labels(ctx, want, api.width, api.height, theme.foreground, theme.background, { chip: false, drop: true })) {
      const i = wanted.get(`${pl.x},${pl.y}`);
      if (i != null) boxes.set(i, pl);
    }

    // Badges go just past their game's label; a game whose label was dropped keeps them by its dot.
    const next: Mark[] = [];
    const place = (i: number, k: number): [number, number] | null => {
      const box = boxes.get(i);
      if (box) return badgeAt(box, k);
      const p = at.get(i);
      return p ? [p[0] + rad(i) + 6, p[1] + k * 20] : null;
    };
    let k = 0;
    for (const dir of ['up', 'down', 'same'] as const) {
      const count = g.centreHidden[dir];
      const xy = count > 0 ? place(centre.i, k) : null;
      if (!xy) continue;
      next.push({ key: `m${centre.i}:${dir}`, x: xy[0], y: xy[1], label: `+${count} ${CENTRE_MORE[dir]}`, act: () => onmore?.(centre.i, dir) });
      k++;
    }
    for (const nd of g.nodes) {
      if ((nd.side !== 'up' && nd.side !== 'down') || nd.hidden <= 0) continue;
      const xy = place(nd.i, 0);
      if (!xy) continue;
      const dir = nd.side;
      next.push(nd.unfolded
        ? { key: `m${nd.i}:${dir}`, x: xy[0], y: xy[1], label: `+${nd.hidden} more`, act: () => onmore?.(nd.i, dir) }
        : { key: `u${nd.i}`, x: xy[0], y: xy[1], label: `⊕ ${nd.hidden}`, act: () => onunfold?.(nd.i) });
    }
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
    position: absolute; transform: translateY(-50%); padding: 0.05rem 0.4rem;
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
