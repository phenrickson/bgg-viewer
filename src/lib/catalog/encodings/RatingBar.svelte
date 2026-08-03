<script lang="ts">
  /**
   * Geek rating as a number over a bar on a FIXED domain.
   *
   * Geek rating is Bayesian, so it is squeezed into roughly 5.5–8.7. Scaling the bar to the
   * current page's own range instead would make every page look the same and destroy
   * comparison between pages — the bar has to mean the same thing everywhere or it means
   * nothing.
   */
  let { value }: { value: number | null } = $props();

  const GEEK_LO = 5.5;
  const GEEK_HI = 8.8;

  const pct = $derived(
    value == null ? 0 : Math.max(0, Math.min(100, ((value - GEEK_LO) / (GEEK_HI - GEEK_LO)) * 100))
  );
  const label = $derived(value == null ? '—' : value.toFixed(2));
</script>

<span class="wrap">
  <span class="gv tnum">{label}</span>
  <span class="gbar"><i style:width="{pct}%"></i></span>
</span>

<style>
  .wrap { display: block; max-width: 7rem; }
  .tnum { font-variant-numeric: tabular-nums; }
  .gv { display: block; font-size: 0.85rem; font-weight: 600; line-height: 1.15; }
  .gbar {
    display: block; height: 3px; border-radius: 2px;
    background: color-mix(in oklch, var(--border) 80%, transparent); overflow: hidden;
  }
  .gbar i { display: block; height: 100%; background: var(--chart-1); border-radius: 2px; }
</style>
