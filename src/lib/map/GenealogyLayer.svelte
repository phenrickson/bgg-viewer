<script lang="ts">
  /**
   * One game's genealogy as a layer on a `PointCanvas` — a sibling of `NetworkLayer` with
   * its own encodings (see the genealogy spec):
   * - one colour for every related game and the accent for the chosen game alone —
   *   above/below already says earlier/later, so colour stays free; upcoming games hollow (background fill, dashed ring) at a fixed size — they have no
   *   ratings yet;
   * - size by ratings (log), so an obscure game reads as obscure without being filtered;
   * - edges curve from parent to child, leaving and arriving vertically, so the view reads
   *   as lines meeting at the chosen game; same-year games hang off shallow arcs along the
   *   centre's row, drawn on the canvas's 2-D underlay. Thick with similarity; solid = similarity only, dashed = same family.
   * - ⊕N (unfold, N waiting) and ⊖ (fold) as a token at the end of the game's label, so
   *   the label placer reserves its room, with an HTML button laid over it. "+N more" past
   *   the cap, and the centre's own overflow, live in the side panel and the controls;
   * - year or generation labels down the left edge.
   *
   * The data square is stretched over the whole canvas (`stretch`), so the tree uses the
   * canvas's width rather than a centred square.
   *
   * Motion: the layer tweens positions itself (`instant`) rather than handing regl a GPU
   * transition, so links and labels travel with their games instead of blinking out for the
   * flight. A change is one ease-out glide: entering games grow out of their parent, leaving
   * ones fold into theirs (`genealogy-tween.ts`). No camera refit — the layout already fits.
   *
   * All copy PLACEHOLDER.
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { Dir, GenealogyNode } from './genealogy';
  import { ndcToScreenY, badgeCentre, labelOrder, type GenealogyLayout } from './genealogy-layout';
  import { useSurface, type Driver, type OverlayApi } from './surface';
  import { ring, glow, labels, LABEL_METRICS } from './ink';
  import type { LabelInput } from './labels';
  import type { Snippet } from 'svelte';
  import PinnedCard from './PinnedCard.svelte';
  import type { Glide } from './glide.svelte';
  import { lineagePalette, bucketOf, diameter, framer, linkStrength, linkWidth, linkAlpha } from './lineage-encoding';

  let {
    coords,
    facts,
    layout,
    glide,
    floor,
    selected = -1,
    card,
    onselect,
    onclear,
    onunfold,
    onfold
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    layout: GenealogyLayout;
    /** The page's motion, shared with the network view. */
    glide: Glide;
    /** The similarity floor: the thinnest a link is drawn (`linkStrength`). */
    floor: number;
    /** The selected game's index, -1 for none. */
    selected?: number;
    /** The selected game's card contents, pinned beside its dot (`PinnedCard`). */
    card?: Snippet;
    onselect?: (i: number) => void;
    /** A click on empty canvas. */
    onclear?: () => void;
    onunfold?: (i: number) => void;
    onfold?: (i: number) => void;
  } = $props();

  const surface = useSurface();
  if (!surface) throw new Error('GenealogyLayer must be mounted inside a PointCanvas');

  const n = $derived(coords.ids.length);
  const g = $derived(layout.genealogy);

  /** The layout's fit, moved into the canvas minus the room the HUD and labels need. */
  const frame = $derived(framer(surface.width, surface.height));
  const pos = $derived.by(() => {
    const x = new Float32Array(n), y = new Float32Array(n);
    g.nodes.forEach((nd, j) => { x[nd.i] = frame.x(layout.x[j]); y[nd.i] = frame.y(layout.y[j]); });
    return { x, y };
  });

  // --- motion ----------------------------------------------------------------------------
  // The page's `Glide` owns the motion, so it carries across a flip to the network view.
  // Declared before the driver effect, so the first frame exists before the canvas reads it.
  $effect(() => {
    glide.to({ centre: g.centre, nodes: g.nodes.map((nd) => ({ i: nd.i, via: nd.via })) }, pos);
  });
  const cur = $derived(glide.cur);
  const leaving = $derived(glide.leaving);

  const palette = $derived(lineagePalette(surface.theme));
  const isUpcoming = (nd: GenealogyNode) => nd.side !== 'centre' && facts.upcoming[nd.i] === 1;
  const diameterOf = (i: number) => diameter(facts, i, g.centre);
  const colour = $derived.by(() => {
    const c = new Uint8Array(n);
    for (const nd of g.nodes) c[nd.i] = bucketOf(facts, nd.i, g.centre);
    for (const l of leaving) c[l.i] = bucketOf(facts, l.i, g.centre);
    return c;
  });
  const size = $derived.by(() => {
    const s = new Uint8Array(n);
    for (const nd of g.nodes) s[nd.i] = diameterOf(nd.i);
    for (const l of leaving) s[l.i] = diameterOf(l.i);
    return s;
  });
  /** What's drawn: the tree, plus anything still folding away. */
  const visible = $derived([...g.nodes.map((nd) => nd.i), ...leaving.map((l) => l.i)]);

  /** Same-year arc height per pixel of horizontal distance, and its ceiling as a share of the height. */
  const ARC_BOW = 0.12, ARC_CAP = 0.03;

  /**
   * Links, painted under the points on the canvas's 2-D underlay from the points' on-screen
   * (mid-glide) positions, so they travel with their games. Parent → child is a cubic leaving
   * and arriving vertically; a same-year game hangs off a shallow arc just above the centre's
   * row (higher the further out, capped so it never reaches another year's row). Not regl
   * lines — see `EgoLayer`'s `underlay` for why.
   */
  function underlay(ctx: CanvasRenderingContext2D, api: OverlayApi) {
    const { theme, screen } = api;
    if (!api.drawn) return;
    const path = (a: number, b: number, same: boolean) => {
      const pa = screen(a), pb = screen(b);
      if (!pa || !pb) return false;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      if (same) {
        const h = Math.min(ARC_BOW * Math.abs(pb[0] - pa[0]), ARC_CAP * api.height);
        // A quadratic peaks at half its control point's offset: put the control at 2h.
        ctx.quadraticCurveTo((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 - 2 * h, pb[0], pb[1]);
      } else {
        const ym = (pa[1] + pb[1]) / 2;
        ctx.bezierCurveTo(pa[0], ym, pb[0], ym, pb[0], pb[1]);
      }
      return true;
    };
    ctx.save();
    ctx.lineCap = 'round';
    // A game folding away keeps a faint plain link to the game it hung off until it lands.
    ctx.strokeStyle = theme.foreground; ctx.globalAlpha = 0.25; ctx.lineWidth = 1.2;
    for (const l of leaving) if (l.via >= 0 && path(l.via, l.i, false)) ctx.stroke();
    const edges = g.nodes.filter((nd) => nd.side !== 'centre');
    for (const e of edges) {
      const lit = e.i === selected || e.via === selected;
      const r = linkStrength(e.sim, floor);
      ctx.globalAlpha = lit ? 1 : linkAlpha(r);
      ctx.strokeStyle = lit ? theme.accent : theme.foreground;
      ctx.lineWidth = linkWidth(r) * (lit ? 1.3 : 1);
      ctx.setLineDash(e.kind === 'family' ? [6, 4] : []);
      if (path(e.via, e.i, e.side === 'same')) ctx.stroke();
    }
    ctx.restore();
  }

  type Mark = { key: string; x: number; y: number; label: string; act: () => void };
  /** Written from inside `overlay` (like NetworkLayer's `tip`); raw so the closures aren't proxied. */
  let marks = $state.raw<Mark[]>([]);
  /** The hovered game and where it is, for the hover card. */
  let tip = $state.raw<{ i: number; x: number; y: number } | null>(null);
  /** The selected game's dot on screen, for its pinned card; and the canvas it sits in. */
  let pin = $state.raw<{ x: number; y: number; r: number; w: number; h: number } | null>(null);
  /** The text's fade, for the HTML laid over the canvas (badges, hover card): set in paint. */
  let textAlpha = $state(1);
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
    // Rings track their dots through pans and zooms (the overlay repaints on regl's own draw
    // event, so it keeps step); text waits for the camera to rest (`api.rest`), below.
    if (!api.drawn) { marks = []; tip = null; pin = null; return; }
    const at = new Map<number, [number, number]>();
    for (const nd of g.nodes) { const p = screen(nd.i); if (p) at.set(nd.i, p); }

    // The chosen game's glow and ring, and the selection's: always, tracking their dots.
    const rad = (i: number) => (diameterOf(i) / 2) * api.pointScale;
    const centre = g.nodes[0];
    const cp = at.get(centre.i);
    if (cp) {
      glow(ctx, cp[0], cp[1], rad(centre.i) * 3, theme.accent, 0.35);
      ring(ctx, cp[0], cp[1], rad(centre.i) + 2, theme.foreground, theme.background, 2.5);
    }
    const sp = selected >= 0 ? at.get(selected) : undefined;
    if (sp) ring(ctx, sp[0], sp[1], rad(selected) + 3, theme.accent, theme.background, 2);
    pin = sp ? { x: sp[0], y: sp[1], r: rad(selected) + 3, w: api.width, h: api.height } : null;

    // Everything with text waits for the games to land and the camera to rest, then fades in
    // (Recommend's rhythm): nothing written slides around on a moving dot or a moving view.
    const settle = Math.min(glide.settle, api.rest);
    textAlpha = settle;
    if (settle === 0) { marks = []; tip = null; return; }
    ctx.save();
    ctx.globalAlpha = settle;

    // Axis labels down the left edge; the y map comes from two placed nodes at distinct y.
    const placed = g.nodes.map((nd) => ({ y: cur.y[nd.i], p: at.get(nd.i) })).filter((v) => v.p);
    const a = placed[0];
    const b = a && placed.find((v) => Math.abs(v.y - a.y) > 1e-6);
    const toPy = a && b ? ndcToScreenY({ y: a.y, py: a.p![1] }, { y: b.y, py: b.p![1] }) : null;
    if (toPy) {
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.6 * settle;
      ctx.fillStyle = theme.foreground;
      for (const tk of layout.ticks) {
        const sy = toPy(frame.y(tk.y));
        if (sy >= 0 && sy <= api.height) ctx.fillText(tk.label, 6, sy);
      }
      ctx.restore();
    }

    const input = new Map<number, LabelInput>();
    for (const nd of g.nodes) {
      const p = at.get(nd.i);
      if (!p) continue;
      const r = rad(nd.i);
      if (isUpcoming(nd)) {
        ctx.save(); ctx.setLineDash([2, 2]);
        ring(ctx, p[0], p[1], r, theme.foreground, theme.background, 1.2);
        ctx.restore();
      }
      if (nd.i === api.hovered && nd.i !== selected) ring(ctx, p[0], p[1], r + 3, theme.foreground, theme.background, 1.5);
      const tk = token(nd);
      input.set(nd.i, { x: p[0], y: p[1], text: `${facts.name(coords.ids[nd.i])} (${yearOf(nd.i)})${tk ? ` ${tk}` : ''}`, gap: r + 4 });
    }
    // The placer keeps a label only if it fits clear of those before it: see `labelOrder`.
    const unfolded = new Set(g.nodes.filter((nd) => nd.unfolded && nd.side !== 'centre').map((nd) => nd.i));
    const order = labelOrder([...input.keys()], g.centre, facts.usersRated, unfolded);
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
    ctx.restore();
    const hp = api.hovered >= 0 && byIndex.has(api.hovered) ? at.get(api.hovered) : undefined;
    // No hover card over the pinned game: its card is already there.
    tip = hp && !api.dragging && api.hovered !== selected ? { i: api.hovered, x: hp[0], y: hp[1] } : null;
    marks = next;
  }

  const driver: Driver = {
    get x() { return cur.x; },
    get y() { return cur.y; },
    get colour() { return colour; },
    get palette() { return palette; },
    get size() { return size; },
    get visible() { return visible; },
    // No camera refit: the layout already fits the tree to the canvas, and a second framing
    // move after the glide was half of the old jank.
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
  // Links and rings follow the selection; the glide repaints after each draw, and the text
  // repaints as it fades in.
  $effect(() => { void selected; void g; void glide.settle; surface.repaint(); });
</script>

{#each marks as m (m.key)}
  <button type="button" class="mark" style:left="{m.x}px" style:top="{m.y}px" style:opacity={textAlpha} onclick={m.act}>{m.label}</button>
{/each}

{#if pin && card}
  <PinnedCard x={pin.x} y={pin.y} r={pin.r} width={pin.w} height={pin.h} alpha={textAlpha}>{@render card()}</PinnedCard>
{/if}

<!-- PLACEHOLDER COPY (Phil): hover card. -->
{#if tip}
  {@const nd = byIndex.get(tip.i)}
  {#if nd}
    <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px" style:opacity={textAlpha}>
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
</style>
