<script lang="ts">
  /**
   * Complexity as a WORD on a badge — Light, Medium-Light, Medium, Medium-Heavy, Heavy — tinted
   * by its band: Discover's `GameRow` badge (`.cx`) as a shared `Badge`, for Recommend's tiles
   * and hero. `GameRow` still carries its own copy; moving it onto this is a follow-up.
   *
   * The tint holds the primary hue and steps only its intensity (Light barely tinted, Heavy
   * full), because an ordered quantity needs an ordered encoding; the word carries the meaning,
   * so it reads in greyscale and to a colourblind reader. An outline rather than a fill, so it
   * never outshouts a title. Nothing renders without a weight.
   *
   * The caller picks the weight: BGG's community `average_weight` (Discover) or the model's
   * `predicted_complexity` (Recommend, whose matches are made on it).
   */
  import { Badge } from '$lib/components/ui/badge';
  import { COMPLEXITY_BANDS, complexityBandIndex } from '$lib/catalog/scope';

  let { weight }: { weight: number | null | undefined } = $props();

  const step = $derived(complexityBandIndex(weight ?? null));
</script>

{#if step > 0}
  <Badge variant="outline" class="cx" style="--step: {step}">{COMPLEXITY_BANDS[step - 1].label}</Badge>
{/if}

<style>
  :global([data-slot='badge'].cx) {
    color: color-mix(in oklch, var(--primary) calc(45% + var(--step) * 11%), var(--muted-foreground));
    border-color: color-mix(in oklch, var(--primary) calc(18% + var(--step) * 9%), transparent);
    background: color-mix(in oklch, var(--primary) calc(4% + var(--step) * 3%), transparent);
  }
</style>
