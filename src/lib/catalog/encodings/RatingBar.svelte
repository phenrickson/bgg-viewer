<script lang="ts">
  /**
   * Geek rating as a number centered above a fill bar, on a FIXED domain.
   *
   * Geek rating is Bayesian, so it is squeezed into roughly 5.5–8.7. Scaling the bar to the
   * current page's own range instead would make every page look the same and destroy
   * comparison between pages — the bar has to mean the same thing everywhere or it means
   * nothing.
   *
   * Fixed colour, not a value ramp — complexity's blue→red ramp answers "how heavy," where
   * heavier isn't better or worse, just different; rating and heaviness aren't the same kind
   * of measure, and don't need to share one colour story.
   */
  import Gauge from './Gauge.svelte';

  let { value, barHeight = '3px' }: { value: number | null; barHeight?: string } = $props();

  const GEEK_LO = 5.5;
  const GEEK_HI = 8.8;
</script>

<Gauge value={value} domain={[GEEK_LO, GEEK_HI]} decimals={2} color="var(--chart-1)" {barHeight} />
