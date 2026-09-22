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
  import { projectionFor, toNdc, type Projection } from './projection';
  import { buildColouring, withDimmed, radiusFor, PLAIN_ALPHA, type Colouring } from './scales';
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
    projection = null,
    lit = null,
    selected = [],
    activeCategories = null,
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
    /** Band only: shift it up (+) or down (−) in NDC, e.g. to leave room for a caption. */
    stripOffset?: number;
    /**
     * Where the points go. Defaults to the embedding projection `view` names; pass one to
     * draw the same games arranged by anything else (see `projection.ts`). This is the seam
     * that stops the layer being an embedding-only component.
     */
    projection?: Projection | null;
    /**
     * Which games are in the current scope, one flag per point (see `scope-mask.ts`).
     * `null` = everything, which is the map's resting state.
     *
     * Out-of-scope games are DRAWN, faded toward the background, not hidden. The one thing
     * this map can say that a list cannot is *where a set sits in the whole landscape*;
     * hiding the rest leaves a scatter of points in a void and throws that away. The
     * context is what makes it a map.
     */
    lit?: Uint8Array | null;
    /** Game ids to ring and label — what a click picked out. Not a filter. */
    selected?: number[];
    /**
     * Which category codes the scope is currently filtering on, so the legend can show
     * which swatches are live. `null` = no category filter, every swatch full strength.
     *
     * The page resolves this from `Scope.categories` (real BGG tag names) into the palette
     * codes the legend draws — the two are the same column, read two ways: a filter asks
     * "does this game carry the tag", the legend asks "is this the tag it is shown as".
     */
    activeCategories?: number[] | null;
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
    /**
     * A legend swatch was clicked. The page turns the palette code back into the real
     * category name and writes it to `Scope`, so the legend is a filter control like the
     * rail's facet list rather than a second, map-only filter.
     */
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
  /** The arrangement: whatever the caller passed, else the one `view` names. */
  const proj = $derived(projection ?? projectionFor(coords, view, facts));
  const strip = $derived(proj.band);

  /**
   * Data → [-1, 1]. A band measures its extent over only the games in scope: an upcoming
   * game can sit far outside the rated data's shape and would squash everything else into
   * the middle. Points outside the scope are still positioned — just not allowed to set
   * the scale.
   */
  const ndc = $derived.by(() =>
    toNdc(proj, proj.band && lit ? (i) => lit[i] === 1 : undefined, stripOffset)
  );

  /** The year currently arriving and how far in it is (see `upTo`). */
  const yearCut = $derived(upTo == null ? null : Math.ceil(upTo));
  const yearFrac = $derived(upTo == null || yearCut == null ? 1 : 1 - (yearCut - upTo));

  /**
   * What is DRAWN — which is very nearly everything.
   *
   * The scope no longer hides games, it dims them (see `lit`): the whole landscape stays on
   * screen so a filtered set can be read against it. Only two things actually remove a
   * point — a position the projection can't place, and the timeline not having reached its
   * year yet, which is a different kind of statement (this game does not exist yet) than a
   * filter (this game is not what you asked for).
   */
  /**
   * Built as an index list AND a flag array in one pass.
   *
   * The list is what regl's filter wants; the flag is what the overlay wants. The overlay
   * used to build `new Set(visible)` inside itself — but it runs on every regl `draw`, i.e.
   * every frame of a pan or zoom, so at a resting map that was a 36k-element Set hashed into
   * existence 60 times a second to answer three `has()` calls about the hovered and selected
   * points. A flag indexed by point costs one byte each, is built only when visibility
   * actually changes, and answers the same question without hashing.
   */
  const visibility = $derived.by(() => {
    const n = coords.ids.length;
    const idx: number[] = [];
    const flag = new Uint8Array(n);
    const kept = keep ? new Set(keep) : null;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(proj.x[i]) || !Number.isFinite(proj.y[i])) continue;
      if (yearCut != null && !(facts.year[i] > 0 && facts.year[i] <= yearCut)) continue;
      if (kept && !kept.has(coords.ids[i])) continue;
      idx.push(i);
      flag[i] = 1;
    }
    return { idx, flag };
  });
  const visible = $derived(visibility.idx);

  const baseColouring: Colouring | null = $derived(
    surface.theme ? buildColouring(view.colour, facts, surface.theme, CURRENT_YEAR) : null
  );
  /** The drawn colouring: the same encoding, with out-of-scope points faded into a dimmed
   * copy of the palette. See `withDimmed` — it costs no extra draw call. */
  const colouring: Colouring | null = $derived(
    baseColouring && surface.theme ? withDimmed(baseColouring, lit, surface.theme.context) : baseColouring
  );

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

  const selectedIdx = $derived(selected.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));
  const anchorIdx = $derived(anchors.map((id) => coords.index.get(id) ?? -1).filter((i) => i >= 0));
  /**
   * Framing follows the filter. `keep` is the lasso's kept set — the map's one set-shaped
   * filter, shown in the rail's Filters group — and it is only non-null once you have
   * applied it; a lasso on its own just highlights. Applying a filter that leaves 40 games
   * scattered across the map should frame them, the same way any filter changes what you
   * are looking at, and clearing it goes back to the whole map.
   *
   * `focus` frames a set the same way but leaves the rest of the map drawn (the tour uses it
   * to zoom into a neighbourhood). `keep` wins when both are given.
   *
   * (An earlier version of this comment justified the framing by the map shrinking when the
   * selection table opened below it. The table overlays the canvas now, so nothing resizes —
   * the framing stands on its own as filter behaviour.)
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
    /** Per-bucket when a scope is lit (see `withDimmed`), one global alpha otherwise. */
    get opacity() { return colouring?.alpha ?? PLAIN_ALPHA; },
    get visible() { return visible; },
    get focus() { return frameIdx; },
    get stretch() { return strip; },
    // Same rule as select: a dimmed point is scenery, so it does not answer to the pointer.
    onhover: (i) => onhover?.(i >= 0 && (!lit || lit[i] === 1) ? coords.ids[i] : null),
    // regl fires the same `select` for a click (one point) and a lasso (many). A click
    // toggles that game in the selection; a lasso adds its games.
    onselect: (points) => {
      // Dimmed points are CONTEXT, not targets. You cannot lasso your way out of the scope
      // you set — a gesture over faded points would otherwise silently widen the set the
      // rail says you are looking at, and the chip bar could no longer describe the view.
      const hits = lit ? points.filter((i) => lit[i] === 1) : points;
      const cur = selected;
      if (points.length === 1) {
        if (!hits.length) return; // a click on a dimmed point does nothing
        const id = coords.ids[hits[0]];
        onselectionchange?.(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
      } else {
        // A lasso replaces rather than adds: each draw is a new question, not another
        // clause on the last one. The page turns this into a filter.
        onselectionchange?.(hits.map((i) => coords.ids[i]));
      }
    },
    overlay: (ctx, api) => {
      const { theme, hovered, screen, pointScale } = api;
      // Flag lookup, not a per-frame Set — see `visibility`.
      const shown = visibility.flag;
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
        if (!shown[i]) continue;
        const p = screen(i);
        if (!p) continue;
        dot(ctx, p[0], p[1], r(i) + 1.5, theme.accent, theme.background);
        want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[i]), gap: r(i) + 4 });
      }
      /**
       * While `keep` is on, every point drawn IS the kept set — ringing and labelling all of
       * them says nothing and buries the map under accent ink. The filter itself is the
       * highlight. Rings come back when the filter is released and the selection is once
       * again a few games among many.
       */
      const labelSelected = !keep && selectedIdx.length <= MAX_SELECTED_LABELS;
      for (const i of keep ? [] : selectedIdx) {
        if (!shown[i]) continue;
        const p = screen(i);
        if (!p) continue;
        ring(ctx, p[0], p[1], r(i) + 3, theme.accent, theme.background, 2);
        if (labelSelected && !anchorIdx.includes(i)) want.push({ x: p[0], y: p[1], text: facts.name(coords.ids[i]), gap: r(i) + 5 });
      }
      labels(ctx, want, api.width, api.height, theme.foreground, theme.background);
      if (hovered >= 0 && shown[hovered]) {
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

<!-- The legend always describes the LIT palette: a faded point is context, and "dimmed
     blue" is not a category anyone needs a key for. Hence `baseColouring`, not `colouring`. -->
{#if baseColouring}
  {@const colouring = baseColouring}
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
            class:off={activeCategories != null && !activeCategories.includes(bucket)}
            onclick={() => ontogglecategory?.(bucket)}
            title="Click to filter to this category; click again to release"
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
