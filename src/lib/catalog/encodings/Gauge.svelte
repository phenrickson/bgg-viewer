<script lang="ts">
  /**
   * A number centered above a fill bar — the value, and where it sits on its domain, shown
   * together. The shared primitive behind RatingBar and ComplexityMeter: both are "a number
   * on a bounded domain," differing only in domain, decimal precision, and colour (fixed vs.
   * a value-based ramp) — the caller owns that and hands Gauge a colour to draw with; Gauge
   * itself has no opinion about what the number means.
   */
  let {
    value,
    domain,
    decimals = 1,
    color,
    barHeight = '3px',
    /**
     * A compact, INTRINSIC size, not "fill whatever grid track I've been dropped into" — a
     * table column is often much wider than a two-character number needs, and without this
     * the bar stretched to the full column width, wildly out of proportion to the number
     * sitting above it.
     */
    width = '3.5rem'
  }: {
    value: number | null;
    domain: [number, number];
    decimals?: number;
    /** A CSS color value — a literal, a token (`var(--chart-1)`), or a computed ramp result. */
    color: string;
    barHeight?: string;
    width?: string;
  } = $props();

  const pct = $derived.by(() => {
    if (value == null) return 0;
    const [lo, hi] = domain;
    return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
  });
  const label = $derived(value == null ? '—' : value.toFixed(decimals));
</script>

<span class="gauge" style:--h={barHeight} style:--w={width}>
  <span class="gv tnum" style:color={value == null ? undefined : color}>{label}</span>
  <span class="gbar"><i style:width="{pct}%" style:background={color}></i></span>
</span>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    width: var(--w);
    max-width: 100%;
  }
  .gv {
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--muted-foreground);
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .gbar {
    width: 100%;
    height: var(--h);
    border-radius: 2px;
    background: color-mix(in oklch, var(--border) 80%, transparent);
    overflow: hidden;
  }
  .gbar i {
    display: block;
    height: 100%;
    border-radius: 2px;
  }
</style>
