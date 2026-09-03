<script lang="ts">
  /**
   * Complexity as a number centered above a fill bar on the 1–5 scale, coloured by a
   * blue(light)→orange→red(heavy) ramp. Continuous, not banded — a 5-segment meter (the
   * previous version) or discrete band colors both draw a hard line between 2.49 and 2.51
   * that the underlying number doesn't actually have; a continuous ramp reads two
   * neighbouring weights as neighbours.
   */
  import Gauge from './Gauge.svelte';
  import { complexityColor } from '$lib/game/similarity';

  let {
    weight,
    barHeight = '3px',
    width
  }: { weight: number | null; barHeight?: string; width?: string } = $props();

  const LO = 1;
  const HI = 5;
</script>

<Gauge value={weight} domain={[LO, HI]} decimals={1} color={complexityColor(weight)} {barHeight} {width} />
