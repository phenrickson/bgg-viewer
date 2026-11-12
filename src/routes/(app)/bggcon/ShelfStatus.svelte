<script lang="ts">
  /**
   * Shelf status as a tag. The news is the exception (almost every copy is on the shelf), so a
   * fully available game shows nothing, a partly checked-out one a quiet note, and one with
   * every copy out a tag that stands out. Words carry the state; colour is a second cue
   * (style-rules), and it's a status token, not the accent.
   */
  import { shelfText } from '$lib/bggcon/format';

  let { available, copies }: { available: number; copies: number } = $props();
  const out = $derived(available <= 0);
</script>

{#if available < copies}
  <span class="tag tnum" class:out>{shelfText(available, copies)}</span>
{/if}

<style>
  .tag {
    flex: none;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .tag.out {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    color: var(--foreground);
    background: color-mix(in oklch, var(--status-warn) 28%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--status-warn) 60%, transparent);
  }
</style>
