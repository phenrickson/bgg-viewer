<script lang="ts">
  /**
   * A two-series stacked sibling of [MiniColumns](MiniColumns.svelte) — same discrete-domain,
   * click-to-filter grammar (one real `<button>` per bucket, whole column is the click target),
   * but each column stacks two disjoint counts instead of drawing one foreground series over a
   * muted backdrop silhouette. There is deliberately no VISIBLE backdrop layer here: a third
   * silhouette behind two already-stacked foreground segments is too much to read in a chart
   * this small, and the two segments already carry their own comparison (see the explore
   * player-count charts design doc).
   *
   * The scale still needs a backdrop, even though nothing is drawn from it. `scale.ts`'s whole
   * point is ONE stable scale so a filter shrinks bars instead of quietly re-normalising the
   * chart to fill itself every time — omitting the backdrop *data* (not just its silhouette)
   * broke that: with no unfiltered reference, `peak`/`grand` recomputed from whatever was
   * currently in scope, so filtering to a small set could make its tallest bar jump back to
   * 100% instead of shrinking, out of step with every other chart on the page (found via
   * `just dev` with a "plays with 1" filter applied — the stacked chart's bars didn't shrink
   * the way `MiniColumns`' backdrop-anchored ones did, right next to it). `backdropBins`/
   * `backdropBins2` supply that unfiltered reference for scaling only.
   */
  import type { ColBin } from './types';
  import type { ScaleMode } from './scale';

  let {
    /** Bottom segment (current scope). */
    bins = [],
    /** Top segment (current scope) — stacked on `bins`. Disjoint from it, so heights sum
     *  without double count. */
    bins2 = [],
    /** Unfiltered counterpart of `bins`, for scale anchoring only — never drawn. Falls back to
     *  `bins` (rescale-to-filtered-peak) if omitted. */
    backdropBins,
    /** Unfiltered counterpart of `bins2` — see `backdropBins`. */
    backdropBins2,
    /** Every bucket to draw, in order — including ones with no games in scope. */
    domain,
    selected = null,
    /** Which series the current `selected` came from — so re-clicking the same segment clears
     *  while clicking the other segment of a lit column switches series. */
    selectedSeries = 1,
    colors = ['var(--chart-1)', 'var(--chart-2)'],
    height = 46,
    scaleMode = 'count',
    label = (v: number) => String(v),
    title = (v: number, n1: number, n2: number) => `${v}: ${(n1 + n2).toLocaleString()}`,
    /**
     * Fires with the bucket AND which stacked series was hit — `1` for the bottom segment
     * (best), `2` for the top (recommended-only), so the caller can filter to the series the
     * reader actually pointed at. Previously the whole column reported one value, which meant
     * clicking the amber segment filtered to best-at: the chart drew two selectable-looking
     * things and only one of them was.
     *
     * `null` clears. Keyboard activation reports series 1 — there is no pointer to hit-test,
     * and the bottom segment is the primary series.
     */
    onpick,
    /** Fires on hover/focus enter (the bucket's value) and leave (`null`) — see MiniColumns. */
    onhover
  }: {
    bins?: ColBin[];
    bins2?: ColBin[];
    backdropBins?: ColBin[];
    backdropBins2?: ColBin[];
    domain: number[];
    selected?: number | null;
    selectedSeries?: 1 | 2;
    colors?: [string, string];
    height?: number;
    scaleMode?: ScaleMode;
    label?: (v: number) => string;
    title?: (v: number, n1: number, n2: number) => string;
    onpick: (v: number | null, series?: 1 | 2) => void;
    onhover?: (v: number | null) => void;
  } = $props();

  const at = (s: ColBin[], v: number) => s.find((b) => b.v === v)?.n ?? 0;
  /** The column is lit for whichever series is filtered — the caller passes one `selected`
   *  bucket regardless of series, so the well marks "this bucket is filtered" and
   *  `selectedSeries` (below) marks which of its two segments did the filtering. */
  const isOn = (v: number) => selected === v;
  const stackTotal = (s1: ColBin[], s2: ColBin[], v: number) => at(s1, v) + at(s2, v);

  const scaleBins = $derived(backdropBins ?? bins);
  const scaleBins2 = $derived(backdropBins2 ?? bins2);

  /**
   * Scaled so the TWO STACKED segments sum to at most 100% of the plot height, against the
   * STABLE (unfiltered) stack totals — see the file doc comment. `count` scales against the
   * tallest stack total; `share` scales each bin's share of the grand total against the
   * largest such share — the stacked analogue of `barScale`'s two modes (`scale.ts`).
   */
  const grand = $derived(domain.reduce((sum, v) => sum + stackTotal(scaleBins, scaleBins2, v), 0));
  const peak = $derived(Math.max(...domain.map((v) => stackTotal(scaleBins, scaleBins2, v)), 1));
  const maxShare = $derived(
    Math.max(
      ...domain.map((v) => (grand > 0 ? stackTotal(scaleBins, scaleBins2, v) / grand : 0)),
      Number.EPSILON
    )
  );
  /**
   * Which segment a click landed on, from the pointer's position within the plot box.
   *
   * Hit-testing geometry rather than adding a nested button per segment: the whole column is
   * the click target (a 2px-tall segment is not clickable), and nesting buttons would break
   * both that and keyboard traversal. A click above the stack's drawn top still counts as the
   * top segment — the reader aimed at that column's upper region and there is nothing else
   * there to mean.
   */
  function hitSeries(e: MouseEvent, v: number): 1 | 2 {
    const plot = (e.currentTarget as HTMLElement).querySelector('.plot');
    if (!plot) return 1;
    const r = plot.getBoundingClientRect();
    if (r.height === 0) return 1;
    // Fraction from the BASELINE up, matching how the bars are drawn.
    const fromBottom = ((r.bottom - e.clientY) / r.height) * 100;
    const n1 = at(bins, v);
    const n2 = at(bins2, v);
    // A segment with nothing in it can't be hit; the other one owns the whole column.
    if (n2 === 0) return 1;
    if (n1 === 0) return 2;
    return fromBottom <= pct(n1) ? 1 : 2;
  }

  const pct = (n: number): number => {
    if (n <= 0) return 0;
    const frac = scaleMode === 'share' ? (grand > 0 ? n / grand / maxShare : 0) : n / peak;
    return Math.max(2, frac * 100);
  };
</script>

<div class="sc" style:--h="{height}px" style:--c1={colors[0]} style:--c2={colors[1]}>
  {#each domain as v (v)}
    {@const n1 = at(bins, v)}
    {@const n2 = at(bins2, v)}
    <!-- Disabled when empty: picking a bucket with no games could only yield no games. -->
    <button
      class="col"
      class:on={isOn(v)}
      class:empty={n1 === 0 && n2 === 0}
      aria-pressed={isOn(v)}
      title={title(v, n1, n2)}
      disabled={n1 === 0 && n2 === 0 && selected !== v}
      onclick={(e) => {
        const series = hitSeries(e, v);
        // Re-clicking the lit column's SAME segment clears; clicking its other segment
        // switches to that one rather than clearing.
        onpick(selected === v && selectedSeries === series ? null : v, series);
      }}
      onmouseenter={() => onhover?.(v)}
      onmouseleave={() => onhover?.(null)}
      onfocus={() => onhover?.(v)}
      onblur={() => onhover?.(null)}
    >
      <span class="plot">
        <!-- `sel` marks WHICH segment the filter came from: the column's tinted well says the
             bucket is filtered, but with two selectable segments that alone can't say which. -->
        <i
          class="seg2"
          class:sel={isOn(v) && selectedSeries === 2}
          style:height="{pct(n2)}%"
          style:bottom="{pct(n1)}%"
        ></i>
        <i class="seg1" class:sel={isOn(v) && selectedSeries === 1} style:height="{pct(n1)}%"></i>
      </span>
      <span class="lab">{label(v)}</span>
    </button>
  {/each}
</div>

<style>
  .sc {
    display: flex;
    align-items: flex-end;
    /* 2px surface gap between adjacent bars — the separator is the gap, not a stroke. */
    gap: 2px;
  }
  .col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    /* No gap: the label band carries its own padding, and a gap here would be one more
       content-derived offset between the baseline and the labels. */
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
    border-radius: 4px;
  }
  .plot {
    position: relative;
    display: block;
    height: var(--h);
    /* The baseline belongs to the PLOT, not the column. It used to hang off the flex
       container, which put the rule underneath the label band — so a chart whose labels
       wrapped ("Medium-Heavy") drew its baseline lower than its neighbours and its bars
       bottomed out at a different height. Anchored here it sits at the foot of a fixed-height
       box, so every chart's baseline lands on the same line regardless of its labels. */
    border-bottom: 1px solid var(--border);
  }
  .plot i {
    position: absolute;
    /* Bars are capped, not slot-filling: a 5-bucket chart and an 8-bucket chart must use
       the same bar thickness, or two charts side by side look like different instruments.
       Centred by inset because these are absolutely positioned, so `max-width` has nothing
       to resolve against; the leftover band width becomes air and the hit target stays the
       full column. */
    --pad: max(0px, (100% - 24px) / 2);
    left: var(--pad);
    right: var(--pad);
    display: block;
    border-radius: 2px 2px 0 0;
  }
  .seg1 {
    bottom: 0;
    background: var(--c1);
  }
  .seg2 {
    background: var(--c2);
  }
  /* The filtered segment, marked by an inset ring rather than a colour change so the series
     hue (the thing carrying identity) is never repainted by selection state. */
  .seg1.sel,
  .seg2.sel {
    box-shadow: inset 0 0 0 2px var(--primary);
  }
  /* Fixed two-line band. Label height must not feed back into where the bars sit: when this
     box was content-sized, a wrapping label ("Medium-Heavy") made its own column taller than
     its neighbours, so the baseline stepped down under that one column and the bars above it
     started lower. A fixed height keeps every bar in a chart, and every chart in a row, on
     one line. */
  .lab {
    height: 2rem;
    padding-top: 0.3rem;
    overflow: hidden;
    font-size: 0.66rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }
  .col:hover .lab,
  .col.on .lab {
    color: var(--foreground);
  }
  .col:hover .seg1,
  .col:hover .seg2 {
    filter: brightness(1.15);
  }
  /* Selection is marked by a tinted well + a bold label, not colour alone. */
  .col.on {
    background: color-mix(in oklch, var(--primary) 14%, transparent);
    outline: 1px solid color-mix(in oklch, var(--primary) 45%, transparent);
  }
  .col.on .lab {
    font-weight: 700;
    color: var(--primary);
  }
  .col.empty {
    cursor: default;
  }
  .col:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
</style>
