<script lang="ts">
  /**
   * A five-segment meter for the 1–5 weight scale, shared by Discover and Explore.
   *
   * Colored with the same ordinal ramp Discover's `.cx` word-badge already uses (one hue,
   * intensity by band) rather than a flat categorical color — an ordered quantity gets an
   * ordered encoding, and a reader who has seen the badge on Discover recognizes the same
   * language here.
   */
  import { complexityBandIndex } from '$lib/catalog/scope';

  let { weight, height = '0.3rem' }: { weight: number | null; height?: string } = $props();

  const step = $derived(complexityBandIndex(weight));

  /** Fill of the i-th (0-based) segment, 0–100. */
  function segPct(i: number): number {
    if (weight == null) return 0;
    return Math.max(0, Math.min(1, weight - i)) * 100;
  }
</script>

<span class="meter" style:--step={step} style:--h={height} aria-hidden="true">
  {#each [0, 1, 2, 3, 4] as i (i)}
    <i><b style:width="{segPct(i)}%"></b></i>
  {/each}
</span>

<style>
  .meter {
    display: flex;
    gap: 1.5px;
  }
  .meter i {
    flex: 1;
    min-width: 0;
    height: var(--h);
    border-radius: 1.5px;
    overflow: hidden;
    background: color-mix(in oklch, var(--border) 80%, transparent);
  }
  /* Same ramp as Discover's `.cx` badge (GameRow.svelte): one hue, intensity by band. */
  .meter b {
    display: block;
    height: 100%;
    background: color-mix(in oklch, var(--primary) calc(45% + var(--step) * 11%), var(--muted-foreground));
  }
</style>
