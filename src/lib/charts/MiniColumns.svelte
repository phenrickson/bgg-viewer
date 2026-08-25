<script lang="ts">
  /**
   * A small discrete distribution you filter by clicking a column — the categorical
   * counterpart to [MiniHistogram](MiniHistogram.svelte). Same two-series idea — a muted
   * universe silhouette behind the solid current scope, both on one scale — but the domain is
   * a fixed list of buckets rather than a continuous axis, so selection is a pick, not a brush.
   *
   * Every column is a real `<button>`, so this one *is* keyboard-reachable.
   */
  import type { ColBin } from './types';
  import { barScale, type ScaleMode } from './scale';

  let {
    bins = [],
    backdrop = [],
    /** Every bucket to draw, in order — including ones with no games in scope. */
    domain,
    selected = null,
    /**
     * Multi-select alternative to `selected`, for a domain whose picks OR together (the
     * complexity bands) rather than replacing one another. When non-empty it decides which
     * columns read as on; `selected` still governs the single-pick charts. Kept as a separate
     * prop rather than widening `selected` to an array so the existing single-pick callers,
     * and the "clicking the active one clears it" behaviour below, are untouched.
     */
    multi,
    color = 'var(--chart-1)',
    height = 46,
    scaleMode = 'count',
    label = (v: number) => String(v),
    title = (v: number, n: number) => `${v}: ${n.toLocaleString()}`,
    onpick,
    /** Fires on hover/focus enter (the bucket's value) and leave (`null`) — optional, for a
     *  caller that wants to show its own on-brand readout instead of relying on the native
     *  `title=""` tooltip this component still carries. */
    onhover
  }: {
    bins?: ColBin[];
    backdrop?: ColBin[];
    domain: number[];
    selected?: number | null;
    multi?: number[];
    color?: string;
    height?: number;
    scaleMode?: ScaleMode;
    label?: (v: number) => string;
    title?: (v: number, n: number) => string;
    onpick: (v: number | null) => void;
    onhover?: (v: number | null) => void;
  } = $props();

  /**
   * Height mapping shared with MiniHistogram — see `scale.ts`.
   *
   * The totals here are *votes*, not games: a game best at both 3 and 4 lands in two buckets.
   * That is the right denominator for "what share of this set's best-at verdicts say 4".
   */
  const at = (s: ColBin[], v: number) => s.find((b) => b.v === v)?.n ?? 0;
  const scale = $derived(barScale([backdrop, bins], scaleMode));
  const backTotal = $derived(scale.totals[0]);
  const binTotal = $derived(scale.totals[1]);
  /** One predicate for both modes, so `class:on`, `aria-pressed` and the disabled rule below
   *  can't disagree about what "on" means. */
  const isOn = (v: number) => (multi ? multi.includes(v) : selected === v);

  const pct = (n: number, total: number) =>
    n > 0 ? Math.max(2, scale.frac(n, total) * 100) : 0;
</script>

<div class="mc" style:--h="{height}px" style:--c={color}>
  {#each domain as v (v)}
    {@const n = at(bins, v)}
    <!-- Disabled when empty: picking a bucket with no games could only yield no games. -->
    <button
      class="col"
      class:on={isOn(v)}
      class:empty={n === 0}
      aria-pressed={isOn(v)}
      title={title(v, n)}
      disabled={n === 0 && !isOn(v)}
      onclick={() => onpick(multi ? v : isOn(v) ? null : v)}
      onmouseenter={() => onhover?.(v)}
      onmouseleave={() => onhover?.(null)}
      onfocus={() => onhover?.(v)}
      onblur={() => onhover?.(null)}
    >
      <span class="plot">
        <i class="back" style:height="{pct(at(backdrop, v), backTotal)}%"></i>
        <i class="fore" style:height="{pct(n, binTotal)}%"></i>
        <!-- The universe's level, kept visible when the scope's share overdraws it. -->
        <i class="backline" style:bottom="{pct(at(backdrop, v), backTotal)}%"></i>
      </span>
      <span class="lab">{label(v)}</span>
    </button>
  {/each}
</div>

<style>
  .mc {
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
    bottom: 0;
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
  .back {
    background: color-mix(in oklch, var(--muted-foreground) 30%, transparent);
  }
  .fore {
    background: var(--c);
  }
  .backline {
    height: 1px;
    border-radius: 0;
    background: color-mix(in oklch, var(--muted-foreground) 62%, transparent);
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
  .col:hover .fore {
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
