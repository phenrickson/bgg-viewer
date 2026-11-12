<script lang="ts">
  /**
   * "2/3 available": available over copies. The leading number carries the state (0 = all out); the dot
   * is a second cue, so it never relies on colour alone (style-rules). The words are in the
   * tooltip and for screen readers. Status tokens, not the accent.
   */
  import { shelfText, shelfLabel } from '$lib/bggcon/format';

  let { available, copies }: { available: number; copies: number } = $props();
</script>

<span class="shelf tnum" class:out={available <= 0} title={shelfLabel(available, copies)}
  ><span aria-hidden="true">{shelfText(available, copies)}</span><span class="sr-only">{shelfLabel(available, copies)}</span></span
>

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
