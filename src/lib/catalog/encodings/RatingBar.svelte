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

  /** Round-number landmarks on the fixed domain, so an unmarked bar gets legible reference
      points — "where does 7 fall" is answerable at a glance instead of assumed. */
  const TICKS = [6, 7, 8];

  const at = (v: number) => Math.max(0, Math.min(100, ((v - GEEK_LO) / (GEEK_HI - GEEK_LO)) * 100));
  const pct = $derived(value == null ? 0 : at(value));
  const label = $derived(value == null ? '—' : value.toFixed(2));
</script>

<span class="wrap">
  <span class="gv tnum">{label}</span>
  <span class="gbar">
    <i style:width="{pct}%"></i>
    {#each TICKS as t (t)}
      <b class="tick" style:left="{at(t)}%"></b>
    {/each}
  </span>
</span>

<style>
  .wrap { display: block; max-width: 7rem; }
  .tnum { font-variant-numeric: tabular-nums; }
  .gv { display: block; font-size: 0.85rem; font-weight: 600; line-height: 1.15; }
  .gbar {
    position: relative;
    display: block; height: 3px; border-radius: 2px;
    background: color-mix(in oklch, var(--border) 80%, transparent); overflow: hidden;
  }
  .gbar i { display: block; height: 100%; background: var(--chart-1); border-radius: 2px; }
  /* Unlabeled — the round numbers are landmarks, not data worth a caption on every row. */
  .tick {
    position: absolute; top: 0; bottom: 0; width: 1px;
    background: color-mix(in oklch, var(--foreground) 45%, transparent);
  }
</style>
