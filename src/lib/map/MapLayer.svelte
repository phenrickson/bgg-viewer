<script lang="ts">
  /**
   * The embedding map as a layer on a `PointCanvas`: projection → positions (PCA pair,
   * UMAP, or one component as a strip), colour and size encodings, the visible set, anchor
   * and selection markers with placed labels, the legend and the hover tooltip. Pure
   * data-in / events-out — no routes, catalog or URL — so the explore page, the tour, a
   * mini-map and a teaser all sit on the same layer. Mount it inside a `PointCanvas`
   * (or use `EmbeddingMap`, which does that for you).
   */
  import type { CoordinateSet } from './coordinates';
  import type { GameFacts } from './facts';
  import type { ViewState } from './view';
  import { buildColouring, radiusFor, type Colouring } from './scales';
  import { useSurface, MAX_DIAMETER, type Driver } from './surface';
  import { dot, ring, labels } from './ink';
  import type { LabelInput } from './labels';

  let {
    coords,
    facts,
    view,
    anchors = [],
    keep = null,
    focus = null,
    stripOffset = 0,
    upTo = null,
    onselectionchange,
    onhover,
    ontogglecategory
  }: {
    coords: CoordinateSet;
    facts: GameFacts;
    view: ViewState;
    anchors?: number[];
    /** Game ids to keep on the map (a lasso set); null = everything the other filters allow. */
    keep?: number[] | null;
    /** Game ids to frame (zoom to) without hiding anything else; null = the whole map. */
    focus?: number[] | null;
    /** Strip only: shift the band up (+) or down (−) in NDC, e.g. to leave room for a caption. */
    stripOffset?: number;
    /**
     * The timeline: only games published up to this point. Fractional — 1994.4 shows every
     * game through 1994 plus 1995's at 40% size, so a year's games grow in over the tick
     * instead of popping. null = all years.
     */
    upTo?: number | null;
    /**
     * The selection changed: a click toggled one game, or a lasso added its enclosed games.
     * The page owns the list (it's `view.selected`); the map only proposes the next one.
     */
    onselectionchange?: (ids: number[]) => void;
    onhover?: (id: number | null) => void;
    /** A legend swatch was clicked — the page decides what the filter becomes. */
    ontogglecategory?: (code: number) => void;
  } = $props();

  const surface = useSurface();
  if (!surface) throw new Error('MapLayer must be mounted inside a PointCanvas');

  const CURRENT_YEAR = new Date().getFullYear();
  // PLACEHOLDER copy — legend titles.
  const COLOUR_LABEL: Record<ViewState['colour'], string> = {
    weight: 'Weight',
    geek: 'Geek rating',
    rating: 'Average rating',
    year: 'Year',
    upcoming: 'Upcoming',
    category: 'Category'
  };
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const MAX_SELECTED_LABELS = 25;

  // --- projection → normalised device coords -------------------------------------------
  const uniform = $derived(view.size === 'uniform');
  const strip = $derived(view.projection === 'strip');
  const xs = $derived(view.projection === 'umap' ? coords.umap[0] : coords.pcs[view.x - 1]);
  /** Strip: y is deterministic per-game jitter (hash of id, roughly normal) — vertical
   * position carries nothing, it just lets the density read. */
  const jitterY = $derived.by(() => {
    const n = coords.ids.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = jitter(coords.ids[i]);
    return out;
  });
  const ys = $derived(strip ? jitterY : view.projection === 'pca' ? coords.pcs[view.y - 1] : coords.umap[1]);
  function jitter(id: number): number {
    let h = (id * 2654435761) >>> 0, s = 0;
    for (let k = 0; k < 4; k++) { h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; s += (h & 0xffff) / 0xffff; }
    return (s / 4 - 0.5) * 3.2; // sum of four uniforms ≈ normal; ±1 is ~2.5σ
  }

  /**
   * Data → [-1, 1]. Map: one shared scale on both axes so distances aren't distorted.
   * Strip: x fills the range of the games currently shown (upcoming games can sit far
   * outside the rated data's shape and would squash it), y is a narrow band.
   */
  const ndc = $derived.by(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (strip && !(facts.upcoming[i] === 1 ? view.upcoming : facts.usersRated[i] >= view.minRatings)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const nx = new Float32Array(xs.length), ny = new Float32Array(xs.length);
    if (strip) {
      const sx = 1.9 / Math.max(x1 - x0, 1e-9), cx = (x0 + x1) / 2;
      for (let i = 0; i < xs.length; i++) { nx[i] = (xs[i] - cx) * sx; ny[i] = ys[i] * 0.22 + stripOffset; }
    } else {
      const s = 1.9 / Math.max(x1 - x0, y1 - y0, 1e-9);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      for (let i = 0; i < xs.length; i++) { nx[i] = (xs[i] - cx) * s; ny[i] = (ys[i] - cy) * s; }
    }
    return { nx, ny };
  });

  /** The year currently arriving and how far in it is (see `upTo`). */
  const yearCut = $derived(upTo == null ? null : Math.ceil(upTo));
  const yearFrac = $derived(upTo == null || yearCut == null ? 1 : 1 - (yearCut - upTo));

  const visible = $derived.by(() => {
    const n = coords.ids.length;
    const idx: number[] = [];
    const cats = view.categories ? new Set(view.categories) : null;
    const kept = keep ? new Set(keep) : null;
    for (let i = 0; i < n; i++) {
      const up = facts.upcoming[i] === 1;
      let show = up ? view.upcoming : facts.usersRated[i] >= view.minRatings;
      if (show && yearCut != null) show = facts.year[i] > 0 && facts.year[i] <= yearCut;
      if (show && cats) show = cats.has(facts.category[i]);
      if (show && kept) show = kept.has(coords.ids[i]);
      if (show && Number.isFinite(xs[i]) && Number.isFinite(ys[i])) idx.push(i);
    }
    return idx;
  });

  const colouring: Colouring | null = $derived(surface.theme ? buildColouring(view.colour, facts, surface.theme, CURRENT_YEAR) : null);

  const sizeBucket = $derived.by(() => {
    const n = coords.ids.length;
    const b = new Uint8Array(n);
    const cut = yearCut, frac = yearFrac;
    for (let i = 0; i < n; i++) {
      let d = 2 * radiusFor(facts.usersRated[i], facts.upcoming[i] === 1, uniform);
      if (cut != null && facts.year[i] === cut) d *= frac;
      b[i] = Math.min(MAX_DIAMETER, Math.max(1, Math.round(d)));
    }
    return b;
  });

  const selectedIdx = $derived(view.selected.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));
  const anchorIdx = $derived(anchors.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));
  /**
   * A lasso set arriving usually also shrinks the map (the table opens below it), and regl
   * keeps its camera, so the kept cluster would sit small in the middle. Frame it instead;
   * clearing the set goes back to the whole map. `focus` frames a set the same way but
   * leaves the rest of the map drawn (the tour uses it to zoom into a neighbourhood).
   * `keep` wins when both are given.
   */
  const frameIdx = $derived.by(() => {
    const k = keep ?? focus;
    if (!k || !k.length) return null;
    const idx = k.map((id) => coords.index.get(id)).filter((i): i is number => i != null);
    return idx.length ? idx : null;
  });

  // --- drive the canvas ------------------------------------------------------------------
  let tip = $state<{ x: number; y: number } | null>(null);
  const driver: Driver = {
    get x() { return ndc.nx; },
    get y() { return ndc.ny; },
    get colour() { return colouring?.bucketOf ?? new Uint8Array(coords.ids.length); },
    get palette() { return colouring?.colours ?? []; },
    get size() { return sizeBucket; },
    get visible() { return visible; },
    get focus() { return frameIdx; },
    get stretch() { return strip; },
    onhover: (i) => onhover?.(i >= 0 ? coords.ids[i] : null),
    // regl fires the same `select` for a click (one point) and a lasso (many). A click
    // toggles that game in the selection; a lasso adds its games.
    onselect: (points) => {
      const cur = view.selected;
      if (points.length === 1) {
        const id = coords.ids[points[0]];
        onselectionchange?.(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
      } else {
        const add = points.map((i) => coords.ids[i]).filter((id) => !cur.includes(id));
        onselectionchange?.([...cur, ...add]);
      }
    },
    overlay: (ctx, api) => {
      const { theme, hovered, screen, pointScale } = api;
      const shown = new Set(visible);
      // The drawn dot is the unzoomed radius times regl's point scale; markers have to track
      // it or they drift as you zoom — most visibly on large dots, which sit closest to their
      // ring to begin with.
      const r = (i: number) =>
        radiusFor(facts.usersRated[i], facts.upcoming[i] === 1, uniform) * pointScale;

      // Markers first, collecting the labels; then one placement pass so labels avoid each
      // other and the edges. Anchors are accent dots, selected games accent rings; labels
      // for selections only while the set is readable.
      const want: LabelInput[] = [];
      for (const i of anchorIdx) {
        if (!shown.has(i)) continue;
        const p = screen(i);
        if (!p) continue;
        dot(ctx, p[0], p[1], r(i) + 1.5, theme.accent, theme.background);
        want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[i]), gap: r(i) + 4 });
      }
      const labelSelected = selectedIdx.length <= MAX_SELECTED_LABELS;
      for (const i of selectedIdx) {
        if (!shown.has(i)) continue;
        const p = screen(i);
        if (!p) continue;
        ring(ctx, p[0], p[1], r(i) + 3, theme.accent, theme.background, 2);
        if (labelSelected && !anchorIdx.includes(i)) want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[i]), gap: r(i) + 5 });
      }
      labels(ctx, want, api.width, api.height, theme.foreground, theme.background);
      if (hovered >= 0 && shown.has(hovered)) {
        const p = screen(hovered);
        if (p) ring(ctx, p[0], p[1], r(hovered) + 3, theme.accent, theme.background, 2);
      }
      tip = hovered >= 0 ? (() => { const p = screen(hovered); return p ? { x: p[0], y: p[1] } : null; })() : null;
    }
  };
  $effect(() => {
    surface.drive(driver);
    return () => surface.release(driver);
  });
  // Marker/label inputs the canvas can't see change → repaint.
  $effect(() => { void selectedIdx; void anchorIdx; surface.repaint(); });

  const hovered = $derived(surface.hovered);
</script>

{#if colouring}
  <div class="legend">
    <div class="legend-title">{COLOUR_LABEL[view.colour]}</div>
    {#if colouring.domain}
      <div class="bar" style:background="linear-gradient(to right, {colouring.colours.slice(1).join(', ')})"></div>
      <div class="ends">
        <span>{fmt(colouring.domain[0])}{colouring.clamped ? '−' : ''}</span>
        {#if colouring.mid != null}
          {@const [lo, hi] = colouring.domain}
          <span class="mid" style:left="{((colouring.mid - lo) / (hi - lo)) * 100}%">{fmt(colouring.mid)}</span>
        {/if}
        <span>{fmt(colouring.domain[1])}{colouring.clamped ? '+' : ''}</span>
      </div>
      <div class="swatch-row"><i style:background={colouring.colours[0]}></i> no value</div>
    {:else}
      {#each colouring.legend as { label, bucket } (bucket)}
        {#if view.colour === 'category'}
          <button
            type="button"
            class="swatch-row"
            class:off={view.categories != null && !view.categories.includes(bucket)}
            onclick={() => ontogglecategory?.(bucket)}
            title="Click to keep only this category; click again to release"
          ><i style:background={colouring.colours[bucket]}></i> {label}</button>
        {:else}
          <div class="swatch-row"><i style:background={colouring.colours[bucket]}></i> {label}</div>
        {/if}
      {/each}
    {/if}
  </div>
{/if}
{#if tip && hovered >= 0}
  {@const id = coords.ids[hovered]}
  <div class="tip" style:left="{tip.x + 14}px" style:top="{tip.y + 14}px">
    <div class="name">{facts.name(id)}</div>
    <div class="meta">
      {facts.year[hovered] || '—'}
      · {facts.weight[hovered] ? facts.weight[hovered].toFixed(2) : '—'} weight
      · {facts.usersRated[hovered].toLocaleString()} ratings
    </div>
  </div>
{/if}

<style>
  .tip {
    position: absolute;
    pointer-events: none;
    max-width: 18rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--card);
    color: var(--foreground);
    box-shadow: 0 2px 8px oklch(0 0 0 / 0.12);
    font-size: 0.8125rem;
    line-height: 1.3;
  }
  .legend {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    pointer-events: auto;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in oklch, var(--card) 88%, transparent);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    line-height: 1.4;
    min-width: 9rem;
  }
  .legend-title { color: var(--foreground); font-weight: 600; margin-bottom: 0.25rem; }
  .bar { height: 0.55rem; border-radius: 2px; }
  .ends { position: relative; display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
  .ends .mid { position: absolute; transform: translateX(-50%); color: var(--foreground); }
  .swatch-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.15rem; }
  button.swatch-row {
    border: 0; background: none; padding: 0; color: inherit; font: inherit; cursor: pointer;
    width: 100%; text-align: left;
  }
  button.swatch-row:hover { color: var(--foreground); }
  button.swatch-row.off { opacity: 0.35; }
  .swatch-row i { width: 0.65rem; height: 0.65rem; border-radius: 50%; flex: none; }
  .tip .name { font-weight: 600; }
  .tip .meta { color: var(--muted-foreground); }
</style>
