<script lang="ts">
  /**
   * "2 of 3 available" / "All 2 out". The words carry the state; the dot is a second cue, so it
   * never relies on colour alone (style-rules). Status tokens, not the accent.
   */
  import { shelfText } from '$lib/bggcon/format';

  let { available, copies }: { available: number; copies: number } = $props();
</script>

<span class="shelf tnum" class:out={available <= 0}>{shelfText(available, copies)}</span>

<style>
  .shelf {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .shelf::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--status-ok);
  }
  .shelf.out::before {
    background: var(--status-warn);
  }
  .shelf.out {
    color: var(--muted-foreground);
  }
</style>
