<script lang="ts">
  /**
   * Complexity as a number centered above a fill bar on the 1–5 scale, coloured by a
   * blue(light)→orange→red(heavy) ramp. Continuous, not banded — a 5-segment meter (the
   * previous version) or discrete band colors both draw a hard line between 2.49 and 2.51
   * that the underlying number doesn't actually have; a continuous ramp reads two
   * neighbouring weights as neighbours.
   */
  import Gauge from './Gauge.svelte';

  let {
    weight,
    barHeight = '3px',
    width
  }: { weight: number | null; barHeight?: string; width?: string } = $props();

  const LO = 1;
  const HI = 5;

  /**
   * Two fixed hues (blue, red/orange), NOT a continuous hue sweep — rotating hue from blue
   * (~245) to red (~25) the short way crosses green/yellow around the midpoint, which is
   * exactly what a "how heavy" scale must not imply. Lightness and chroma carry the value
   * within each half instead (paler/duller near the middle, more saturated toward each end,
   * same construction Scatter.svelte's `div()` uses for its own blue/rose diverging scale),
   * and only the hue itself switches, right at the midpoint, from blue to orange.
   */
  function rampColor(v: number | null): string {
    if (v == null) return 'var(--muted-foreground)';
    const u = Math.max(0, Math.min(1, (v - LO) / (HI - LO)));
    if (u < 0.5) {
      const t = u / 0.5;
      return `oklch(${0.78 - 0.18 * t} ${0.05 + 0.11 * t} 245)`;
    }
    // Bright orange at the midpoint, darkening to deep red at the top — a wide lightness
    // swing (0.72 -> 0.54) is what actually reads as a gradient; the previous version moved
    // lightness by only 0.05 across this whole half, so 3.1 and 4.9 looked nearly identical.
    const t = (u - 0.5) / 0.5;
    return `oklch(${0.72 - 0.18 * t} ${0.14 + 0.05 * t} ${55 - 33 * t})`;
  }
</script>

<Gauge value={weight} domain={[LO, HI]} decimals={1} color={rampColor(weight)} {barHeight} {width} />
