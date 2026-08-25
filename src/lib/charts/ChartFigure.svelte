<script lang="ts">
  /**
   * The shared frame for the panel's small-multiple column charts.
   *
   * Exists because the three charts it wraps were built as independent figures and only
   * *looked* aligned by accident: `.fhead`'s `min-height` is a floor, so the moment one header
   * wrapped to a second or third line (title + legend + toggle, at a narrow grid column) that
   * chart's plot started tens of pixels below its neighbours' — three charts on one row with
   * three different baselines. Content-derived heights can't hold a row together; fixed ones can.
   *
   * So every band is an explicit grid row of fixed height, whatever it holds:
   *
   *   header  — one line, never wraps (the title ellipses rather than pushing the chart down)
   *   readout — reserved even when empty, so hovering can't resize the figure
   *   chart   — the caller's chart, which carries its own fixed plot box and label band
   *
   * The other half of the alignment guarantee lives in the charts themselves: the baseline is
   * anchored to the fixed-height plot box, and the label band is a fixed two lines. Both are
   * required — a header that can't grow doesn't help if a wrapping *label* moves the bars,
   * which is precisely what "Medium-Heavy" did.
   */
  import type { Snippet } from 'svelte';

  let {
    title,
    height = 104,
    legend,
    readout,
    children
  }: {
    title: string;
    /** Plot height in px — the row the chart itself occupies. */
    height?: number;
    /** Optional legend/controls, right-aligned in the header row. */
    legend?: Snippet;
    /** Hover readout. Its row is reserved whether or not this is passed, so hovering can
     *  never change the figure's height and shift the charts beside it. */
    readout?: Snippet;
    /** The chart, plus its own label band. */
    children: Snippet;
  } = $props();
</script>

<figure class="fig" style:--plot-h="{height}px">
  <div class="head">
    <h3>{title}</h3>
    {#if legend}<div class="legend">{@render legend()}</div>{/if}
  </div>
  <div class="readout">{#if readout}{@render readout()}{/if}</div>
  <div class="plot">{@render children()}</div>
</figure>

<style>
  .fig {
    margin: 0;
    display: grid;
    /* Fixed rows, not `auto` — see the component comment. This is the whole point of the file. */
    /* header, then the chart (its own fixed plot box + fixed 2rem label band). The chart owns
       its labels, so this frame does NOT reserve a separate row for them — doing that just
       added empty space below every figure. What this grid guarantees is that the header can
       never grow and push the chart down. */
    grid-template-rows: var(--head-h) var(--readout-h) auto;
    --head-h: 1.75rem;
    --readout-h: 1rem;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    overflow: hidden;
  }
  h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 650;
    /* Ellipsis rather than wrap: a wrapped title is exactly what knocked the row out of
       alignment before. Losing a few characters is recoverable; a shifted baseline isn't. */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .legend {
    margin-left: auto;
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: var(--muted-foreground);
  }
  /* The chart fills the plot row exactly; its own label band overflows into the labels row,
     which is reserved above so that overflow is never a surprise. */
  .plot {
    min-width: 0;
  }
  .readout {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
