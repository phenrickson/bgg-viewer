<script lang="ts">
  /**
   * A game's availability: one dot per copy (filled = available) and the words, "2 of 3
   * available" / "All 2 out". The words carry the state; the dots are a second, at-a-glance cue
   * (style-rules: never colour alone). Status tokens, not the accent.
   */
  import { shelfText } from '$lib/bggcon/format';

  let { available, copies }: { available: number; copies: number } = $props();
  const free = $derived(Math.max(0, Math.min(copies, available)));
  /** Past a handful of copies the dots stop being countable at a glance; the words carry it. */
  const DOTS_MAX = 6;
</script>

<span class="avail tnum" class:out={free === 0}>
  {#if copies <= DOTS_MAX}
    <span class="dots" aria-hidden="true">
      {#each { length: copies } as _, i (i)}<span class="dot" class:gone={i >= free}></span>{/each}
    </span>
  {/if}
  {shelfText(available, copies)}
</span>

<style>
  .avail {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .dots {
    display: inline-flex;
    gap: 3px;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--status-ok);
  }
  .dot.gone {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--status-warn);
  }
</style>
